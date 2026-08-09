/* Validação e montagem de uma entrada de jogo enviada pelo formulário de
 * upload do admin. Fica separado de server.js só pra virar testável sozinho
 * (não depende de Express nem de rede).
 */

const VIRTUAL_GAMEPAD = require("./gamepad");

// As mesmas 4 chaves de core que o resto do app entende (lib/gamepad.js já é
// a lista canônica — evita duas listas que podem desalinhar).
const CORES = Object.keys(VIRTUAL_GAMEPAD);

const CORE_EXTENSIONS = {
  nes: [".nes"],
  snes: [".sfc", ".smc"],
  gba: [".gba"],
  segaMD: [".bin", ".md", ".gen"],
};

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

/**
 * `fields` = { title, genre, core, tags, confirmRights }, tudo string.
 * `files` = { rom: {originalname, buffer, size}, cover: {...} }.
 * `existingIds` = Set com todo id já usado (estático + dinâmico), pra não
 * colidir.
 */
function buildGameEntry(fields, files, existingIds) {
  const title = String(fields.title || "").trim().slice(0, 60);
  if (!title) throw new ValidationError("Título é obrigatório.");

  const core = String(fields.core || "");
  if (!CORES.includes(core)) {
    throw new ValidationError(`Console inválido. Use um de: ${CORES.join(", ")}.`);
  }

  // O checkbox de direitos é obrigatório — ver README/"ROM local" sobre por
  // que ROM comercial não pode entrar aqui: o repositório e o deploy deste
  // app são públicos, então qualquer upload vira distribuição pública na
  // hora, não importa a intenção de quem sobe.
  if (!fields.confirmRights || fields.confirmRights === "false") {
    throw new ValidationError(
      "Confirme que você tem o direito de distribuir esse arquivo publicamente."
    );
  }

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
  const cover = files.cover;
  if (cover.size > MAX_COVER_BYTES) {
    throw new ValidationError(`Capa maior que ${(MAX_COVER_BYTES / 1024 / 1024).toFixed(1)}MB.`);
  }
  const coverExt = extOf(cover.originalname);
  if (!COVER_EXTENSIONS.includes(coverExt)) {
    throw new ValidationError(`Capa precisa ser ${COVER_EXTENSIONS.join(", ")}.`);
  }

  let id = slugify(title) || "jogo";
  if (existingIds.has(id)) {
    let n = 2;
    while (existingIds.has(`${id}-${n}`)) n++;
    id = `${id}-${n}`;
  }

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

module.exports = {
  CORES,
  CORE_EXTENSIONS,
  COVER_EXTENSIONS,
  MAX_ROM_BYTES,
  MAX_COVER_BYTES,
  ValidationError,
  slugify,
  parseTags,
  buildGameEntry,
};
