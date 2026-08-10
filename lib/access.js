/* Controle de acesso por link único.
 *
 * Como a proteção funciona, em uma frase: o link sozinho não abre nada — quem
 * abre é o *cookie* que o servidor entrega pro primeiro aparelho que usar o
 * link. Copiar a URL e mandar pra outra pessoa não leva o cookie junto, e o
 * segundo aparelho bate num "já em uso".
 *
 * Limites honestos (estão no README também):
 *  - Se o link for repassado ANTES do primeiro uso, quem abrir primeiro fica
 *    com ele. O vínculo é com o primeiro aparelho, não com uma identidade.
 *  - Nada impede o dono legítimo de emprestar o próprio aparelho.
 *  - Limpar os dados do navegador derruba o vínculo; por isso o admin tem o
 *    botão de "religar" (reset).
 */

const crypto = require("crypto");
const { createSigner, readCookies, setCookie, clearCookie } = require("./cookie-signing");

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";

// Segredo pra assinar cookies. Em produção precisa ser fixo entre deploys,
// senão todo mundo é deslogado a cada publicação. Sem env var, gera um
// aleatório por processo (serve pra dev; o README explica).
const SECRET =
  process.env.ACCESS_SECRET || crypto.randomBytes(32).toString("hex");

const { pack, unpack } = createSigner(SECRET);

// "open": qualquer um entra (padrão, mantém o demo público funcionando).
// "locked": só entra com link válido.
const ACCESS_MODE = (process.env.ACCESS_MODE || "open").toLowerCase();

const DEVICE_COOKIE = "myde_dev";
const SESSION_COOKIE = "myde_ses";
const ADMIN_COOKIE = "myde_adm";

// Depois desse tempo sem sinal de vida, a sessão conta como encerrada — serve
// pro admin mostrar quem está online agora.
const ONLINE_WINDOW_MS = 3 * 60 * 1000;

/** Id estável do aparelho. Cria e grava no primeiro contato. */
function deviceId(req, res) {
  const cookies = readCookies(req);
  const existing = unpack(cookies[DEVICE_COOKIE]);
  if (existing) return existing;
  const fresh = crypto.randomBytes(16).toString("hex");
  setCookie(res, DEVICE_COOKIE, pack(fresh), 60 * 60 * 24 * 365);
  return fresh;
}

function sessionTokenId(req) {
  return unpack(readCookies(req)[SESSION_COOKIE]);
}

function startSession(res, tokenId) {
  setCookie(res, SESSION_COOKIE, pack(tokenId), 60 * 60 * 24 * 365);
}

function endSession(res) {
  clearCookie(res, SESSION_COOKIE);
}

function newToken(label) {
  return {
    id: crypto.randomBytes(9).toString("base64url"), // 12 chars, curto pra QR
    label: label || "",
    createdAt: Date.now(),
    boundDevice: null,
    boundAt: null,
    lastSeen: null,
    opens: 0,
    revoked: false,
  };
}

const CLAIM = {
  OK: "ok",
  NOT_FOUND: "not_found",
  REVOKED: "revoked",
  IN_USE: "in_use",
};

/**
 * Tenta usar um token neste aparelho.
 * Primeiro aparelho a abrir fica com ele; qualquer outro é recusado.
 */
async function claim(store, tokenId, device) {
  const token = await store.get(tokenId);
  if (!token) return { status: CLAIM.NOT_FOUND };
  if (token.revoked) return { status: CLAIM.REVOKED, token };

  if (token.boundDevice && token.boundDevice !== device) {
    return { status: CLAIM.IN_USE, token };
  }

  const now = Date.now();
  if (!token.boundDevice) {
    token.boundDevice = device;
    token.boundAt = now;
  }
  token.lastSeen = now;
  token.opens += 1;
  await store.put(token);
  return { status: CLAIM.OK, token };
}

/** Confere se o pedido atual tem sessão válida (usado no gate das páginas). */
async function currentSession(store, req, res) {
  if (ACCESS_MODE !== "locked") return { allowed: true, open: true };

  const tokenId = sessionTokenId(req);
  if (!tokenId) return { allowed: false, reason: "no_session" };

  const token = await store.get(tokenId);
  if (!token) return { allowed: false, reason: "no_session" };
  if (token.revoked) return { allowed: false, reason: "revoked" };

  const device = unpack(readCookies(req)[DEVICE_COOKIE]);
  if (!device || token.boundDevice !== device) {
    return { allowed: false, reason: "wrong_device" };
  }
  return { allowed: true, token };
}

async function touch(store, tokenId) {
  const token = await store.get(tokenId);
  if (!token || token.revoked) return false;
  token.lastSeen = Date.now();
  await store.put(token);
  return true;
}

// --- admin ----------------------------------------------------------------

const adminConfigured = Boolean(ADMIN_PASSWORD);

function checkAdminPassword(input) {
  if (!adminConfigured) return false;
  const a = Buffer.from(String(input || ""));
  const b = Buffer.from(ADMIN_PASSWORD);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function isAdmin(req) {
  if (!adminConfigured) return false;
  const value = unpack(readCookies(req)[ADMIN_COOKIE]);
  return value === "admin";
}

function loginAdmin(res) {
  setCookie(res, ADMIN_COOKIE, pack("admin"), 60 * 60 * 8);
}

function logoutAdmin(res) {
  clearCookie(res, ADMIN_COOKIE);
}

function isOnline(token) {
  return Boolean(token.lastSeen && Date.now() - token.lastSeen < ONLINE_WINDOW_MS);
}

module.exports = {
  ACCESS_MODE,
  CLAIM,
  ONLINE_WINDOW_MS,
  adminConfigured,
  secretFromEnv: Boolean(process.env.ACCESS_SECRET),
  deviceId,
  sessionTokenId,
  startSession,
  endSession,
  newToken,
  claim,
  currentSession,
  touch,
  checkAdminPassword,
  isAdmin,
  loginAdmin,
  logoutAdmin,
  isOnline,
};
