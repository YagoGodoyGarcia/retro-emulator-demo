/* Regras de destino/validação do upload direto navegador->Vercel Blob
 * (Fase 4). Separado do handler HTTP de propósito: testável sem token real
 * nem rede.
 *
 * @vercel/blob deixa o *cliente* propor o pathname (é assim que a lib
 * funciona — o servidor não reescreve, só aprova ou recusa em
 * onBeforeGenerateToken). "Servidor controla o destino" aqui significa: o
 * pathname só passa se bater com roms/<plataforma>/<arquivo> ou
 * covers/<plataforma>/<arquivo>, sem subpasta extra, sem "..", com
 * extensão válida pra aquela plataforma — qualquer coisa fora disso é
 * recusada antes de qualquer token ser emitido. Essa rota já fica atrás de
 * requireAdmin (server.js); isso aqui é a segunda camada, sobre o formato
 * do arquivo em si.
 */

const platforms = require("./platforms");
const gameEntry = require("./game-entry");

// Limite por plataforma vive em lib/platforms.js (maxRomBytes) — fonte
// única. Cartucho pequeno tem um teto realista (NES ~1MB, GBA 32MB pelo
// limite físico do cartucho); disco (CD/DVD) fica sob o mesmo teto
// genérico dos outros porque o upload direto pro Blob ainda não fala
// multipart — arquivo de disco de verdade (200MB-4GB+) não é realista
// nesse mecanismo hoje, isso não finge que já suporta.
const COVER_SIZE_LIMIT = 1.5 * 1024 * 1024;

class BlobUploadError extends Error {}

function parseClientPayload(raw) {
  try {
    const parsed = JSON.parse(raw || "{}");
    if (!parsed || typeof parsed !== "object") throw new Error("payload não é objeto");
    return parsed;
  } catch (e) {
    throw new BlobUploadError("clientPayload inválido — precisa ser JSON com kind e platform.");
  }
}

function extOf(pathname) {
  const dot = pathname.lastIndexOf(".");
  return dot === -1 ? "" : pathname.slice(dot).toLowerCase();
}

/**
 * Decide se um pedido de token de upload pode seguir. `pathname` é o que o
 * navegador propôs escrever no Blob; `clientPayloadRaw` é a string JSON
 * que o admin manda junto (`{ kind: "roms"|"covers", platform }`).
 *
 * Lança BlobUploadError com mensagem segura pra devolver ao cliente se
 * algo não bater. Retorna as constraints pro handleUpload() do
 * @vercel/blob quando aprovado.
 */
function reviewUploadRequest(pathname, clientPayloadRaw) {
  const payload = parseClientPayload(clientPayloadRaw);
  const kind = payload.kind;
  if (kind !== "roms" && kind !== "covers") {
    throw new BlobUploadError(`kind inválido: "${kind}". Use "roms" ou "covers".`);
  }

  const platform = String(payload.platform || "");
  if (!platforms.CORES.includes(platform)) {
    throw new BlobUploadError(`plataforma inválida: "${platform}".`);
  }

  const expectedPrefix = `${kind}/${platform}/`;
  if (typeof pathname !== "string" || !pathname.startsWith(expectedPrefix)) {
    throw new BlobUploadError(`destino não permitido — esperado começar com "${expectedPrefix}".`);
  }

  const rest = pathname.slice(expectedPrefix.length);
  if (!rest || rest.includes("/") || rest.includes("..")) {
    throw new BlobUploadError(`nome de arquivo inválido em "${pathname}".`);
  }

  const ext = extOf(pathname);
  const allowedExt = kind === "roms" ? platforms.extensionsOf(platform) : gameEntry.COVER_EXTENSIONS;
  if (!allowedExt.includes(ext)) {
    throw new BlobUploadError(
      `extensão "${ext || "?"}" não combina com ${kind}/${platform}. Esperado: ${allowedExt.join(", ")}.`
    );
  }

  return {
    maximumSizeInBytes: kind === "roms" ? platforms.get(platform).maxRomBytes : COVER_SIZE_LIMIT,
    // ROM não tem um content-type confiável entre navegadores (.gen/.md às
    // vezes vêm com mimetype genérico ou vazio, .zip de romset de arcade
    // vem como application/zip de verdade) — quem valida é a extensão do
    // pathname, já checada acima. `["*/*"]` NÃO funciona como "libera
    // tudo" na API do Vercel Blob (o casamento de wildcard exige o formato
    // "tipo/*", ex. "application/*" — "*/*" nunca bate com um content-type
    // real e todo upload de ROM com mimetype reconhecido pelo navegador,
    // como .zip, era recusado com "Content type mismatch"). `undefined`
    // omite a restrição de fato. Capa continua restrita a imagem de
    // verdade.
    allowedContentTypes: kind === "roms" ? undefined : ["image/*"],
  };
}

module.exports = { BlobUploadError, reviewUploadRequest, COVER_SIZE_LIMIT };
