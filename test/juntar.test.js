const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "test-password";
process.env.ACCESS_SECRET = process.env.ACCESS_SECRET || "test-access-secret";
process.env.ACCESS_MODE = "open";

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
    const req = http.request(
      { hostname: "127.0.0.1", port, path, method: options.method || "GET", headers: options.headers || {} },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () =>
          resolve({ statusCode: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString("utf8") })
        );
      }
    );
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

test("GET /juntar mostra o formulário público com token CSRF", async () => {
  const page = await request("/juntar");
  assert.equal(page.statusCode, 200);
  assert.match(page.body, /id="join-form"/);
  assert.match(cookieValue(page, "myde_csrf"), /^[0-9]+\.[A-Za-z0-9_-]+\.[a-f0-9]{32}$/);
});

test("POST /juntar recusa sem CSRF", async () => {
  const page = await request("/juntar");
  const csrfToken = cookieValue(page, "myde_csrf");
  const body = JSON.stringify({ name: "Fã do TikTok" });
  const rejected = await request("/juntar", {
    method: "POST",
    headers: {
      Cookie: `myde_csrf=${encodeURIComponent(csrfToken)}`,
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(body),
    },
    body,
  });
  assert.equal(rejected.statusCode, 403);
});

test("POST /juntar recusa sem nome", async () => {
  const page = await request("/juntar");
  const csrfToken = cookieValue(page, "myde_csrf");
  const body = JSON.stringify({ name: "" });
  const rejected = await request("/juntar", {
    method: "POST",
    headers: {
      Cookie: `myde_csrf=${encodeURIComponent(csrfToken)}`,
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(body),
      "X-CSRF-Token": csrfToken,
    },
    body,
  });
  assert.equal(rejected.statusCode, 400);
});

test("POST /juntar com nome válido cria a carteira, sem mostrar o link, marcada como 'form'", async () => {
  const page = await request("/juntar");
  const csrfToken = cookieValue(page, "myde_csrf");
  const body = JSON.stringify({ name: "Fã do TikTok", email: "", gameId: "flappybird-nes" });
  const accepted = await request("/juntar", {
    method: "POST",
    headers: {
      Cookie: `myde_csrf=${encodeURIComponent(csrfToken)}`,
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(body),
      "X-CSRF-Token": csrfToken,
    },
    body,
  });
  assert.equal(accepted.statusCode, 200);
  const result = JSON.parse(accepted.body);
  assert.equal(result.ok, true);
  assert.equal(result.link, undefined); // não expõe o link — admin manda na mão

  const adminPage = await request("/admin", { headers: { Cookie: adminCookie } });
  const adminCsrf = cookieValue(adminPage, "myde_csrf");
  const list = await request("/admin/api/clients", { headers: { Cookie: `${adminCookie}; myde_csrf=${encodeURIComponent(adminCsrf)}` } });
  const clients = JSON.parse(list.body).clients;
  const created = clients.find((c) => c.label === "Fã do TikTok");
  assert.ok(created, "carteira criada pelo formulário não apareceu no painel");
  assert.equal(created.source, "form");
  assert.ok(created.games.includes("flappybird-nes"));
});
