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

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";

// Segredo pra assinar cookies. Em produção precisa ser fixo entre deploys,
// senão todo mundo é deslogado a cada publicação. Sem env var, gera um
// aleatório por processo (serve pra dev; o README explica).
const SECRET =
  process.env.ACCESS_SECRET || crypto.randomBytes(32).toString("hex");

// "open": qualquer um entra (padrão, mantém o demo público funcionando).
// "locked": só entra com link válido.
const ACCESS_MODE = (process.env.ACCESS_MODE || "open").toLowerCase();

const DEVICE_COOKIE = "myde_dev";
const SESSION_COOKIE = "myde_ses";
const ADMIN_COOKIE = "myde_adm";

// Depois desse tempo sem sinal de vida, a sessão conta como encerrada — serve
// pro admin mostrar quem está online agora.
const ONLINE_WINDOW_MS = 3 * 60 * 1000;

function sign(value) {
  return crypto.createHmac("sha256", SECRET).update(value).digest("hex").slice(0, 32);
}

function pack(value) {
  return `${value}.${sign(value)}`;
}

// Comparação em tempo constante — evita vazar o segredo byte a byte por timing.
function unpack(signed) {
  if (typeof signed !== "string") return null;
  const idx = signed.lastIndexOf(".");
  if (idx < 1) return null;
  const value = signed.slice(0, idx);
  const mac = signed.slice(idx + 1);
  const expected = sign(value);
  if (mac.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;
  return value;
}

// Express não parseia cookie sem middleware; é simples o bastante pra não
// valer uma dependência.
function readCookies(req) {
  const header = req.headers.cookie;
  if (!header) return {};
  const out = {};
  header.split(";").forEach((part) => {
    const eq = part.indexOf("=");
    if (eq < 0) return;
    const k = part.slice(0, eq).trim();
    const v = part.slice(eq + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  });
  return out;
}

function setCookie(res, name, value, maxAgeSeconds) {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAgeSeconds}`,
  ];
  // Em produção (Vercel) sempre https; local em http o Secure impediria o
  // cookie de ser gravado.
  if (process.env.VERCEL || process.env.NODE_ENV === "production") parts.push("Secure");
  const prev = res.getHeader("Set-Cookie");
  const list = prev ? (Array.isArray(prev) ? prev.slice() : [prev]) : [];
  list.push(parts.join("; "));
  res.setHeader("Set-Cookie", list);
}

function clearCookie(res, name) {
  setCookie(res, name, "", 0);
}

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
