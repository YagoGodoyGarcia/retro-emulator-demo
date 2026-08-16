const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

process.env.ADMIN_PASSWORD = "test-password";
process.env.ACCESS_SECRET = "test-access-secret";
process.env.ACCESS_MODE = "open";
process.env.PUBLIC_ORIGIN = "https://myde.example";

const app = require("../server");
const { createSigner } = require("../lib/cookie-signing");
const signer = createSigner(process.env.ACCESS_SECRET);
const adminCookie = `myde_adm=${encodeURIComponent(signer.pack("admin"))}`;

let server;
let port;

before(async () => {
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  port = server.address().port;
});

after(async () => {
  await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
});

function request(path, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: "127.0.0.1",
      port,
      path,
      method: options.method || "GET",
      headers: options.headers || {},
    }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve({
        statusCode: res.statusCode,
        headers: res.headers,
        body: Buffer.concat(chunks).toString("utf8"),
      }));
    });
    req.on("error", reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

function cookieValue(response, name) {
  const setCookies = response.headers["set-cookie"] || [];
  const row = setCookies.find((cookie) => cookie.startsWith(`${name}=`));
  assert.ok(row, `cookie ${name} não foi emitido`);
  return decodeURIComponent(row.slice(name.length + 1).split(";", 1)[0]);
}

test("respostas incluem headers de segurança e usam PUBLIC_ORIGIN nos links", async () => {
  const response = await request("/admin/api/tokens", { headers: { Cookie: adminCookie } });

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["x-content-type-options"], "nosniff");
  assert.equal(response.headers["referrer-policy"], "strict-origin-when-cross-origin");
  assert.equal(response.headers["x-frame-options"], "DENY");

  const page = await request("/admin", { headers: { Cookie: adminCookie } });
  assert.equal(page.statusCode, 200);
  assert.match(page.body, /window\.__ADMIN_CSRF__/);
  assert.match(cookieValue(page, "myde_csrf"), /^[0-9]+\.[A-Za-z0-9_-]+\.[a-f0-9]{32}$/);
});

test("mutações administrativas recusam CSRF ausente e aceitam token válido", async () => {
  const page = await request("/admin", { headers: { Cookie: adminCookie } });
  const csrfToken = cookieValue(page, "myde_csrf");
  const cookie = `${adminCookie}; myde_csrf=${encodeURIComponent(csrfToken)}`;
  const body = JSON.stringify({ label: "teste HTTP" });
  const headers = {
    Cookie: cookie,
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
  };

  const rejected = await request("/admin/api/tokens", {
    method: "POST",
    headers,
    body,
  });
  assert.equal(rejected.statusCode, 403);

  const accepted = await request("/admin/api/tokens", {
    method: "POST",
    headers: { ...headers, "X-CSRF-Token": csrfToken },
    body,
  });
  assert.equal(accepted.statusCode, 200);
  assert.equal(JSON.parse(accepted.body).token.label, "teste HTTP");

  const list = await request("/admin/api/tokens", { headers: { Cookie: adminCookie } });
  assert.match(JSON.parse(list.body).tokens[0].url, /^https:\/\/myde\.example\/t\//);
});
