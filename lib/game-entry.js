/* Validação e montagem de uma entrada de jogo enviada pelo formulário de
 * upload do admin. Fica separado de server.js só pra virar testável sozinho
 * (não depende de Express nem de rede).
 */

const platforms = require("./platforms");

// Consoles válidos e suas extensões vêm de lib/platforms.js — fonte única
// (antes eram duas listas separadas, uma aqui e outra em lib/gamepad.js, que
// podiam desalinhar sem ninguém perceber).
const CORES = platforms.CORES;
const CORE_EXTENSIONS = Object.fromEntries(platforms.list().map((p) => [p.id, p.extensions]));

const COVER_EXTENSIONS = [".png", ".jpg", ".jpeg", ".gif", ".webp"];

// Vercel limita o corpo de uma function serverless comum a 4.5MB — não é
// coisa nossa, é teto de plataforma. Fica com folga pro resto do multipart
// (capa + campos de texto) não estourar isso.
const MAX_ROM_BYTES = 4 * 1024 * 1024;
const MAX_COVER_BYTES = 1.5 * 1024 * 1024;
const MAX_TAGS = 12;

function extOf(filename) {
  const dot = filename.lastIndexOf(".");
  return dot === -1 ? "" : filename.slice(dot).toLowerCase();
}

// "Ação-RPG: A Volta!" -> "acao-rpg-a-volta". Mesma normalização de acento
// que a busca da vitrine usa (NFD + strip diacríticos).
function slugify(str) {
  return String(str)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // acentos, mesma tecnica de public/js/library.js
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function parseTags(raw) {
  return String(raw || "")
    .split(/[,\n]/)
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, MAX_TAGS)
    .map((t) => t.slice(0, 24));
}

class ValidationError extends Error {}

const STATUSES = ["draft", "review", "published", "archived"];

// Compartilhado entre buildGameEntry e buildImportEntry: título, console e
// o checkbox de direitos (obrigatório nos dois — seção 4/16 do briefing:
// "preserve o mecanismo atual de confirmação de direitos", inclusive no
// fluxo de importação em lote).
function validateCommon(fields) {
  const title = String((fields && fields.title) || "").trim().slice(0, 60);
  if (!title) throw new ValidationError("Título é obrigatório.");

  const core = String((fields && fields.core) || "");
  if (!CORES.includes(core)) {
    throw new ValidationError(`Console inválido. Use um de: ${CORES.join(", ")}.`);
  }

  // Ver README/"ROM local" sobre por que ROM comercial não pode entrar
  // aqui: o repositório e o deploy deste app são públicos, então qualquer
  // upload vira distribuição pública na hora, não importa a intenção de
  // quem sobe.
  if (!fields || !fields.confirmRights || fields.confirmRights === "false") {
    throw new ValidationError(
      "Confirme que você tem o direito de distribuir esse arquivo publicamente."
    );
  }

  return { title, core };
}

// "id" já em uso — estático ou dinâmico, pra não colidir. "jogo", "jogo-2",
// "jogo-3"...
function resolveId(title, existingIds) {
  let id = slugify(title) || "jogo";
  if (existingIds.has(id)) {
    let n = 2;
    while (existingIds.has(`${id}-${n}`)) n++;
    id = `${id}-${n}`;
  }
  return id;
}

// Compartilhado entre buildGameEntry (upload novo, capa obrigatória) e
// buildGameUpdate (edição, capa opcional — só valida se veio uma nova).
function validateCoverFile(cover) {
  if (cover.size > MAX_COVER_BYTES) {
    throw new ValidationError(`Capa maior que ${(MAX_COVER_BYTES / 1024 / 1024).toFixed(1)}MB.`);
  }
  const coverExt = extOf(cover.originalname);
  if (!COVER_EXTENSIONS.includes(coverExt)) {
    throw new ValidationError(`Capa precisa ser ${COVER_EXTENSIONS.join(", ")}.`);
  }
  return coverExt;
}

/**
 * `fields` = { title, genre, core, tags, confirmRights }, tudo string.
 * `files` = { rom: {originalname, buffer, size}, cover: {...} }.
 * `existingIds` = Set com todo id já usado (estático + dinâmico), pra não
 * colidir.
 */
function buildGameEntry(fields, files, existingIds) {
  const { title, core } = validateCommon(fields);

  if (!files || !files.rom) throw new ValidationError("Selecione o arquivo da ROM.");
  const rom = files.rom;
  if (rom.size > MAX_ROM_BYTES) {
    throw new ValidationError(
      `ROM maior que ${(MAX_ROM_BYTES / 1024 / 1024).toFixed(1)}MB — limite de corpo de requisição da Vercel. ` +
        'Pra arquivos maiores, veja "ROM local" no README.'
    );
  }
  const romExt = extOf(rom.originalname);
  const allowedExt = CORE_EXTENSIONS[core];
  if (!allowedExt.includes(romExt)) {
    throw new ValidationError(
      `Extensão "${romExt || "?"}" não combina com ${core}. Esperado: ${allowedExt.join(", ")}.`
    );
  }

  if (!files.cover) throw new ValidationError("Selecione uma imagem de capa.");
  const coverExt = validateCoverFile(files.cover);

  const id = resolveId(title, existingIds);

  return {
    id,
    romFilename: `${id}${romExt}`,
    coverFilename: `${id}${coverExt}`,
    entry: {
      core,
      gameId: id,
      title,
      genre: String(fields.genre || "").trim().slice(0, 40),
      tags: parseTags(fields.tags),
      // gameUrl/cover são preenchidos por quem chama, depois do upload —
      // aqui só validamos e montamos os metadados.
    },
  };
}

/**
 * Commita um jogo cuja ROM já foi enviada direto pro Blob pelo navegador
 * (Fase 4 — POST /admin/api/blob/upload-token), sem passar arquivo nenhum
 * por aqui. `fields` = { title, core, genre, tags, confirmRights, gameUrl,
 * romFilename }. Mesma validação de título/console/direitos de
 * buildGameEntry, só que confere a extensão do romFilename já enviado em
 * vez de validar um Buffer que não existe nesta requisição.
 *
 * Sempre entra como status "review" — importação em lote não publica
 * sozinha (seção 22 do briefing: revisar antes de publicar). Sem capa
 * ainda é esperado aqui; fica pendente até editar.
 */
function buildImportEntry(fields, existingIds) {
  const { title, core } = validateCommon(fields);

  const gameUrl = String((fields && fields.gameUrl) || "");
  if (!gameUrl) throw new ValidationError("gameUrl é obrigatório — a ROM precisa já estar no Blob.");

  const romFilename = String((fields && fields.romFilename) || "");
  const romExt = extOf(romFilename);
  const allowedExt = CORE_EXTENSIONS[core];
  if (!romFilename || !allowedExt.includes(romExt)) {
    throw new ValidationError(
      `Extensão "${romExt || "?"}" não combina com ${core}. Esperado: ${allowedExt.join(", ")}.`
    );
  }

  const id = resolveId(title, existingIds);

  return {
    id,
    entry: {
      core,
      gameId: id,
      title,
      genre: String((fields && fields.genre) || "").trim().slice(0, 40),
      tags: parseTags(fields && fields.tags),
    },
  };
}

/**
 * Edição de um jogo já cadastrado — metadados de texto (título, gênero,
 * temas), opcionalmente uma capa nova, e opcionalmente o status
 * (draft/review/published/archived — usado pra publicar um jogo importado
 * depois de revisado). ROM e console não mudam por aqui: trocar o core
 * invalidaria a extensão da ROM já enviada, e trocar o arquivo da ROM é, na
 * prática, um novo upload (apagar e adicionar de novo).
 *
 * `cover`, se vier, é o mesmo formato de `files.cover` do buildGameEntry
 * ({originalname, buffer, size}). Retorna `coverExt` só quando uma capa nova
 * foi validada — quem chama decide o que fazer com ela (upload + apagar a
 * antiga); string vazia/undefined = manter a capa atual.
 */
function buildGameUpdate(fields, cover) {
  const title = String((fields && fields.title) || "").trim().slice(0, 60);
  if (!title) throw new ValidationError("Título é obrigatório.");

  const update = {
    title,
    genre: String((fields && fields.genre) || "").trim().slice(0, 40),
    tags: parseTags(fields && fields.tags),
  };

  if (cover) update.coverExt = validateCoverFile(cover);

  if (fields && fields.status) {
    if (!STATUSES.includes(fields.status)) {
      throw new ValidationError(`Status inválido. Use um de: ${STATUSES.join(", ")}.`);
    }
    update.status = fields.status;
  }

  // "featured" só existia hardcoded em config/keychains.json até agora —
  // vem como string de FormData ("true"/"false"), não boolean de verdade.
  if (fields && fields.featured !== undefined) {
    update.featured = fields.featured === "true" || fields.featured === true;
  }

  return update;
}

module.exports = {
  CORES,
  CORE_EXTENSIONS,
  COVER_EXTENSIONS,
  MAX_ROM_BYTES,
  MAX_COVER_BYTES,
  STATUSES,
  ValidationError,
  slugify,
  parseTags,
  buildGameEntry,
  buildImportEntry,
  buildGameUpdate,
};
