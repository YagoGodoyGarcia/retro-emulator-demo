const { test } = require("node:test");
const assert = require("node:assert/strict");
const csrf = require("../lib/csrf");

function fakeResponse() {
  const headers = {};
  return {
    headers,
    getHeader(name) { return headers[name]; },
    setHeader(name, value) { headers[name] = value; },
  };
}

function cookieFrom(res) {
  const setCookie = res.getHeader("Set-Cookie");
  const first = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  return decodeURIComponent(first.split(";", 1)[0].split("=", 2)[1]);
}

function request(token, cookie = token, body = {}) {
  return {
    headers: {
      cookie: `myde_csrf=${encodeURIComponent(cookie)}`,
      [csrf.HEADER_NAME]: token,
    },
    body,
  };
}

test("emite token e valida o double-submit cookie", () => {
  const res = fakeResponse();
  const token = csrf.setToken(res, 1_000);

  assert.equal(csrf.isValid(request(token), 1_000), true);
  assert.match(res.getHeader("Set-Cookie")[0], /^myde_csrf=/);
  assert.doesNotMatch(res.getHeader("Set-Cookie")[0], /HttpOnly/);
});

test("recusa token ausente, cookie diferente e token adulterado", () => {
  const res = fakeResponse();
  const token = csrf.setToken(res, 2_000);

  assert.equal(csrf.isValid(request("", cookieFrom(res)), 2_000), false);
  assert.equal(csrf.isValid(request(token, "outro-token"), 2_000), false);
  assert.equal(csrf.isValid(request(`${token}x`, cookieFrom(res)), 2_000), false);
});

test("recusa token expirado ou emitido no futuro", () => {
  const res = fakeResponse();
  const token = csrf.setToken(res, 3_000);
  const futureRes = fakeResponse();
  const futureToken = csrf.setToken(futureRes, 40_000);

  assert.equal(csrf.isValid(request(token), 3_000 + csrf.MAX_AGE_MS), true);
  assert.equal(csrf.isValid(request(token), 3_000 + csrf.MAX_AGE_MS + 1), false);
  assert.equal(csrf.isValid(request(futureToken), 3_000), false);
});

test("aceita token no clientPayload usado pelo upload direto", () => {
  const res = fakeResponse();
  const token = csrf.setToken(res, 4_000);
  const req = request("", cookieFrom(res), { clientPayload: JSON.stringify({ csrfToken: token }) });
  delete req.headers[csrf.HEADER_NAME];

  assert.equal(csrf.isValid(req, 4_000), true);
});
