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
      {
        hostname: "127.0.0.1",
        port,
        path,
        method: options.method || "GET",
        headers: options.headers || {},
      },
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

async function createClient() {
  const adminPage = await request("/admin", { headers: { Cookie: adminCookie } });
  const adminCsrf = cookieValue(adminPage, "myde_csrf");
  const body = JSON.stringify({ label: "", gameId: "flappybird-nes" });
  const created = await request("/admin/api/clients", {
    method: "POST",
    headers: {
      Cookie: `${adminCookie}; myde_csrf=${encodeURIComponent(adminCsrf)}`,
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(body),
      "X-CSRF-Token": adminCsrf,
    },
    body,
  });
  assert.equal(created.statusCode, 200, created.body);
  return JSON.parse(created.body).client;
}

// As 3 rotas client-facing que ficaram de fora do padrão CSRF do admin:
// POST /api/heartbeat, POST /c/:id/claim, POST /api/access-requests.

test("POST /api/heartbeat recusa sem CSRF e aceita com token da home", async () => {
  const home = await request("/");
  const csrfToken = cookieValue(home, "myde_csrf");
  assert.match(home.body, /window\.__CSRF__/);

  const rejected = await request("/api/heartbeat", { method: "POST", headers: { Cookie: `myde_csrf=${encodeURIComponent(csrfToken)}` } });
  assert.equal(rejected.statusCode, 403);

  const accepted = await request("/api/heartbeat", {
    method: "POST",
    headers: { Cookie: `myde_csrf=${encodeURIComponent(csrfToken)}`, "X-CSRF-Token": csrfToken },
  });
  assert.equal(accepted.statusCode, 200);
});

test("POST /c/:id/claim recusa sem CSRF e aceita com token da própria página do link", async () => {
  const client = await createClient();

  const linkPage = await request(`/c/${client.id}`);
  assert.equal(linkPage.statusCode, 200);
  const csrfToken = cookieValue(linkPage, "myde_csrf");
  const cookie = `myde_csrf=${encodeURIComponent(csrfToken)}`;
  const body = JSON.stringify({ name: "Jogador Teste" });
  const baseHeaders = { Cookie: cookie, "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) };

  const rejected = await request(`/c/${client.id}/claim`, { method: "POST", headers: baseHeaders, body });
  assert.equal(rejected.statusCode, 403);

  const accepted = await request(`/c/${client.id}/claim`, {
    method: "POST",
    headers: { ...baseHeaders, "X-CSRF-Token": csrfToken },
    body,
  });
  assert.equal(accepted.statusCode, 200);
  assert.equal(JSON.parse(accepted.body).ok, true);
});

test("POST /api/access-requests recusa sem CSRF (com sessão de cliente válida)", async () => {
  const client = await createClient();
  const linkPage = await request(`/c/${client.id}`);
  const csrfToken = cookieValue(linkPage, "myde_csrf");
  const claimBody = JSON.stringify({ name: "Outro Jogador" });
  const claimed = await request(`/c/${client.id}/claim`, {
    method: "POST",
    headers: {
      Cookie: `myde_csrf=${encodeURIComponent(csrfToken)}`,
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(claimBody),
      "X-CSRF-Token": csrfToken,
    },
    body: claimBody,
  });
  assert.equal(claimed.statusCode, 200);
  const clientCookie = cookieValue(claimed, "myde_cli");

  const home = await request("/", { headers: { Cookie: `myde_cli=${encodeURIComponent(clientCookie)}` } });
  const homeCsrf = cookieValue(home, "myde_csrf");
  const reqBody = JSON.stringify({ gameId: "invaders-nes" });
  const headers = {
    Cookie: `myde_cli=${encodeURIComponent(clientCookie)}; myde_csrf=${encodeURIComponent(homeCsrf)}`,
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(reqBody),
  };

  const rejected = await request("/api/access-requests", { method: "POST", headers, body: reqBody });
  assert.equal(rejected.statusCode, 403);
});
