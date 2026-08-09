/* Onde os arquivos enviados pelo admin (ROM + capa) são gravados.
 *
 * Na Vercel o filesystem é só leitura fora de /tmp — não dá pra escrever em
 * public/roms/ dali. Por isso: com BLOB_READ_WRITE_TOKEN configurado, sobe
 * pro Vercel Blob (URL pública, CDN, sobrevive a deploy). Sem essa variável
 * E rodando na Vercel (`process.env.VERCEL`), upload fica desligado — não dá
 * pra fingir que funciona e perder o arquivo no próximo cold start.
 *
 * Em dev local (sem VERCEL), cai pro disco mesmo sem token: grava em
 * public/roms/private/ e public/covers/private/, que ficam de fora do git
 * (.gitignore) — mesma ideia da seção "ROM local" do README, agora também
 * alimentada pelo formulário do admin.
 */

const fs = require("fs/promises");
const path = require("path");

const onVercel = Boolean(process.env.VERCEL);
const blobToken = process.env.BLOB_READ_WRITE_TOKEN || "";
const durable = Boolean(blobToken);

// Upload fica disponível se: tem Blob configurado (funciona em qualquer
// lugar), OU não estamos na Vercel (dev local, grava em disco).
const canUpload = durable || !onVercel;

let blobLib = null;
function loadBlobLib() {
  if (!blobLib) blobLib = require("@vercel/blob");
  return blobLib;
}

const LOCAL_ROOT = path.join(__dirname, "..", "public");

async function uploadLocal(kind, filename, buffer) {
  const dir = path.join(LOCAL_ROOT, kind, "private");
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, filename), buffer);
  return `/${kind}/private/${filename}`;
}

async function removeLocal(kind, filename) {
  try {
    await fs.unlink(path.join(LOCAL_ROOT, kind, "private", filename));
  } catch (e) {
    // já não existia — tudo bem, o objetivo (não estar mais lá) já vale
  }
}

/**
 * Sobe um arquivo. `kind` é "roms" ou "covers" (também usado como pasta).
 * Retorna a URL pra usar em gameUrl/cover — relativa em dev local, absoluta
 * (Blob) em produção.
 */
async function upload(kind, filename, buffer, contentType) {
  if (durable) {
    const { put } = loadBlobLib();
    const blob = await put(`${kind}/${filename}`, buffer, {
      access: "public",
      contentType,
      addRandomSuffix: false,
      token: blobToken,
    });
    return blob.url;
  }
  if (!onVercel) return uploadLocal(kind, filename, buffer);
  throw new Error("upload indisponível: configure BLOB_READ_WRITE_TOKEN");
}

async function remove(kind, filename, url) {
  if (durable && url) {
    const { del } = loadBlobLib();
    await del(url, { token: blobToken });
    return;
  }
  if (!onVercel) return removeLocal(kind, filename);
}

/**
 * Lista todo objeto no Blob sob `kind` ("roms" ou "covers") — usado só pelo
 * "Verificar biblioteca" do admin (Fase 9), pra achar arquivo órfão (no
 * Blob, mas nenhum jogo aponta pra ele). Sem paginação manual: a conta de
 * jogos deste projeto está bem abaixo do limite de 1000 por página.
 */
async function list(kind) {
  if (!durable) return [];
  const { list: listBlobs } = loadBlobLib();
  const result = await listBlobs({ prefix: `${kind}/`, token: blobToken, limit: 1000 });
  return result.blobs;
}

module.exports = { durable, canUpload, onVercel, upload, remove, list };
