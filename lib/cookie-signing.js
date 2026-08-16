/* Helpers de cookie assinado, extraídos de lib/access.js pra serem
 * reaproveitados por lib/clients.js sem duplicar a mesma lógica de HMAC.
 */

const crypto = require("crypto");

function createSigner(secret) {
  function sign(value) {
    return crypto.createHmac("sha256", secret).update(value).digest("hex").slice(0, 32);
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

  return { sign, pack, unpack };
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

function setCookie(res, name, value, maxAgeSeconds, options = {}) {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    ...(options.httpOnly === false ? [] : ["HttpOnly"]),
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

module.exports = { createSigner, readCookies, setCookie, clearCookie };
