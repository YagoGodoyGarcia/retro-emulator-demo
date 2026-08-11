const { test } = require("node:test");
const assert = require("node:assert/strict");
const { limiter } = require("../lib/rate-limit");

function fakeReqRes(ip) {
  const req = { headers: {}, socket: { remoteAddress: ip } };
  const headers = {};
  const res = {
    statusCode: 200,
    setHeader(k, v) { headers[k] = v; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    headers,
  };
  return { req, res };
}

test("libera até o limite, depois bloqueia com 429", () => {
  const mw = limiter("test-basic", { windowMs: 60000, max: 2 });
  const a = fakeReqRes("1.1.1.1");
  const b = fakeReqRes("1.1.1.1");
  const c = fakeReqRes("1.1.1.1");
  let calls = 0;
  const next = () => { calls++; };

  mw(a.req, a.res, next);
  mw(b.req, b.res, next);
  mw(c.req, c.res, next);

  assert.equal(calls, 2);
  assert.equal(c.res.statusCode, 429);
  assert.ok(c.res.body.error);
});

test("IPs diferentes têm contadores independentes", () => {
  const mw = limiter("test-per-ip", { windowMs: 60000, max: 1 });
  const a = fakeReqRes("2.2.2.2");
  const b = fakeReqRes("3.3.3.3");
  let calls = 0;
  const next = () => { calls++; };

  mw(a.req, a.res, next);
  mw(b.req, b.res, next);

  assert.equal(calls, 2);
});

test("onLimited customizado é chamado em vez do JSON padrão", () => {
  let handled = false;
  const mw = limiter("test-onlimited", {
    windowMs: 60000,
    max: 1,
    onLimited: (req, res) => { handled = true; },
  });
  const a = fakeReqRes("4.4.4.4");
  const b = fakeReqRes("4.4.4.4");
  mw(a.req, a.res, () => {});
  mw(b.req, b.res, () => {});

  assert.equal(handled, true);
});
