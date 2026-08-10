/* Login de cliente — sem senha, sem provedor externo (Google etc).
 *
 * Como funciona, em uma frase: o admin cria a conta e recebe um link
 * (/c/:id) pra mandar por e-mail/WhatsApp; visitar esse link sempre loga
 * naquela conta, em qualquer aparelho, quantas vezes precisar — não é um
 * link de uso único como o convite de lib/access.js, é o "login" mesmo.
 *
 * Diferença de propósito pro token de convite (lib/access.js): aquele
 * libera o catálogo inteiro pro primeiro aparelho que abrir. Este identifica
 * uma pessoa, pra poder atrelar posse de jogo específico a ela
 * (lib/ownership.js) — é a peça que faltava pra "cartucho exclusivo".
 */

const crypto = require("crypto");
const { createSigner, readCookies, setCookie, clearCookie } = require("./cookie-signing");

// Mesmo padrão de lib/access.js: fixo em produção via env var, sorteado por
// processo em dev.
const SECRET = process.env.ACCESS_SECRET || crypto.randomBytes(32).toString("hex");
const { pack, unpack } = createSigner(SECRET);

const CLIENT_COOKIE = "myde_cli";

function newClient(label, email) {
  return {
    // O id também é o código de login (a parte secreta da URL /c/:id) — não
    // precisa de um campo separado, mesma ideia do token de convite.
    id: crypto.randomBytes(12).toString("base64url"),
    label: String(label || "").slice(0, 60),
    email: String(email || "").slice(0, 120),
    createdAt: Date.now(),
    lastSeen: null,
    revoked: false,
  };
}

function startSession(res, clientId) {
  setCookie(res, CLIENT_COOKIE, pack(clientId), 60 * 60 * 24 * 365);
}

function endSession(res) {
  clearCookie(res, CLIENT_COOKIE);
}

function sessionClientId(req) {
  return unpack(readCookies(req)[CLIENT_COOKIE]);
}

/** Cliente logado neste request, ou null — nunca bloqueia sozinho (quem
 * decide se um jogo exige isso é o chamador, na rota). */
async function currentClient(clientsStore, req) {
  const clientId = sessionClientId(req);
  if (!clientId) return null;
  const client = await clientsStore.get(clientId);
  if (!client || client.revoked) return null;
  return client;
}

async function touch(clientsStore, clientId) {
  const client = await clientsStore.get(clientId);
  if (!client || client.revoked) return false;
  client.lastSeen = Date.now();
  await clientsStore.put(client);
  return true;
}

module.exports = {
  CLIENT_COOKIE,
  newClient,
  startSession,
  endSession,
  sessionClientId,
  currentClient,
  touch,
};
