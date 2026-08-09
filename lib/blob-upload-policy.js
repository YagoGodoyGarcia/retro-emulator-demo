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

// Maior cartucho oficial de cada console (com folga), não um número
// arbitrário: NES ~1MB no maior jogo comercial, SNES chegou a 6MB (Star
// Ocean/Tales of Phantasia), GBA vai a 32MB (limite físico do cartucho),
// Mega Drive raramente passou de 4MB (uns poucos foram a 8MB). Homebrew
// desses consoles fica bem abaixo disso na prática.
const ROM_SIZE_LIMITS = {
  nes: 1 * 1024 * 1024,
  snes: 8 * 1024 * 1024,
  gba: 32 * 1024 * 1024,
  segaMD: 8 * 1024 * 1024,
};
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
    maximumSizeInBytes: kind === "roms" ? ROM_SIZE_LIMITS[platform] : COVER_SIZE_LIMIT,
    // ROM não tem um content-type confiável entre navegadores (.gen/.md às
    // vezes vêm com mimetype genérico ou vazio) — quem valida de verdade é
    // a extensão do pathname, já checada acima. Capa continua restrita a
    // imagem de verdade.
    allowedContentTypes: kind === "roms" ? ["*/*"] : ["image/*"],
  };
}

module.exports = { BlobUploadError, reviewUploadRequest, ROM_SIZE_LIMITS, COVER_SIZE_LIMIT };
