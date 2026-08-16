/* Contas de cliente sem senha. O admin pode criar uma conta pronta ou
 * entregar um link de cadastro: a primeira pessoa que informar o nome fica
 * vinculada ao link, que continua sendo o login persistente daquela carteira.
 */

const crypto = require("crypto");
const { createSigner, readCookies, setCookie, clearCookie } = require("./cookie-signing");

const SECRET = process.env.ACCESS_SECRET || crypto.randomBytes(32).toString("hex");
const { pack, unpack } = createSigner(SECRET);
const CLIENT_COOKIE = "myde_cli";

function normalizeLabel(value) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, 60);
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase().slice(0, 120);
}

function validEmail(value) {
  return !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

// `source` é só rótulo pro admin distinguir de onde veio a conta ("admin" —
// criada no painel — ou "form" — quem preencheu o formulário público
// /juntar) — não afeta login, sessão nem posse.
function newClient(label, email, source) {
  const cleanLabel = normalizeLabel(label);
  const cleanEmail = normalizeEmail(email);
  return {
    id: crypto.randomBytes(12).toString("base64url"),
    label: cleanLabel,
    email: cleanEmail,
    source: source === "form" ? "form" : "admin",
    createdAt: Date.now(),
    claimedAt: cleanLabel ? Date.now() : null,
    lastSeen: null,
    revoked: false,
  };
}

function claim(client, label, email) {
  if (!client || client.revoked) return { ok: false, error: "link indisponível" };
  if (client.label) return { ok: false, error: "este link já foi cadastrado" };
  const cleanLabel = normalizeLabel(label);
  const cleanEmail = normalizeEmail(email);
  if (cleanLabel.length < 2) return { ok: false, error: "informe seu nome" };
  if (!validEmail(cleanEmail)) return { ok: false, error: "informe um e-mail válido ou deixe em branco" };
  client.label = cleanLabel;
  client.email = cleanEmail;
  client.claimedAt = Date.now();
  client.lastSeen = Date.now();
  return { ok: true, client };
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
  claim,
  normalizeLabel,
  normalizeEmail,
  validEmail,
  startSession,
  endSession,
  sessionClientId,
  currentClient,
  touch,
};
