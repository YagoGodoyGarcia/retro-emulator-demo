const crypto = require("crypto");
const { createSigner, readCookies, setCookie } = require("./cookie-signing");

const SECRET = process.env.ACCESS_SECRET || crypto.randomBytes(32).toString("hex");
const { pack, unpack } = createSigner(SECRET);
const COOKIE_NAME = "myde_csrf";
const MAX_AGE_MS = 8 * 60 * 60 * 1000;
const CLOCK_SKEW_MS = 30 * 1000;
const HEADER_NAME = "x-csrf-token";

function issue(now = Date.now()) {
  const nonce = crypto.randomBytes(32).toString("base64url");
  return pack(`${now}.${nonce}`);
}

function setToken(res, now = Date.now()) {
  const token = issue(now);
  setCookie(res, COOKIE_NAME, token, Math.ceil(MAX_AGE_MS / 1000), { httpOnly: false });
  return token;
}

function payloadToken(body) {
  if (!body || typeof body !== "object") return "";
  if (typeof body.csrfToken === "string") return body.csrfToken;
  if (typeof body.clientPayload !== "string") return "";

  try {
    const payload = JSON.parse(body.clientPayload);
    return payload && typeof payload.csrfToken === "string" ? payload.csrfToken : "";
  } catch (_) {
    return "";
  }
}

function readToken(req) {
  const header = req && req.headers && (req.headers[HEADER_NAME] || req.headers["X-CSRF-Token"]);
  return typeof header === "string" && header ? header : payloadToken(req && req.body);
}

function sameToken(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

function isValid(req, now = Date.now()) {
  const submitted = readToken(req);
  const cookie = readCookies(req)[COOKIE_NAME] || "";
  if (!sameToken(submitted, cookie)) return false;

  const value = unpack(submitted);
  if (!value) return false;

  const separator = value.indexOf(".");
  if (separator < 1) return false;

  const issuedAt = Number(value.slice(0, separator));
  if (!Number.isSafeInteger(issuedAt)) return false;
  if (issuedAt > now + CLOCK_SKEW_MS) return false;
  return now - issuedAt <= MAX_AGE_MS;
}

module.exports = { COOKIE_NAME, HEADER_NAME, MAX_AGE_MS, issue, setToken, isValid, readToken };
