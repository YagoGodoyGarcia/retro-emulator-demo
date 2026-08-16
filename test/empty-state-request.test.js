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

function adminCsrfCookie(adminPage) {
  const token = cookieValue(adminPage, "myde_csrf");
  return { token, cookie: `${adminCookie}; myde_csrf=${encodeURIComponent(token)}` };
}

test("carteira logada sem nenhum jogo vê botão 'Solicitar acesso' na vitrine, e o pedido usa lib/access-requests.js", async () => {
  // 1. Admin cria e reivindica uma carteira com um jogo (claim automático,
  //    como o painel já faz hoje).
  const adminPage1 = await request("/admin", { headers: { Cookie: adminCookie } });
  const admin1 = adminCsrfCookie(adminPage1);
  const createBody = JSON.stringify({ label: "Jogador Sem Jogo", gameId: "flappybird-nes" });
  const created = await request("/admin/api/clients", {
    method: "POST",
    headers: { Cookie: admin1.cookie, "Content-Type": "application/json", "Content-Length": Buffer.byteLength(createBody), "X-CSRF-Token": admin1.token },
    body: createBody,
  });
  assert.equal(created.statusCode, 200, created.body);
  const client = JSON.parse(created.body).client;
  assert.equal(client.claimGameId, "flappybird-nes");

  // 2. Admin desatribui o jogo (cenário real: revogar acesso sem apagar a
  //    carteira) -- a carteira continua com claimGameId apontando pro jogo,
  //    mas sem posse nenhuma.
  const adminPage2 = await request("/admin", { headers: { Cookie: adminCookie } });
  const admin2 = adminCsrfCookie(adminPage2);
  const unassigned = await request(`/admin/api/clients/${client.id}/games/flappybird-nes`, {
    method: "DELETE",
    headers: { Cookie: admin2.cookie, "X-CSRF-Token": admin2.token },
  });
  assert.equal(unassigned.statusCode, 200, unassigned.body);

  // 3. A carteira já tem nome (foi criada com label preenchido, então já
  //    conta como "reivindicada") -- visitar /c/:id emite a sessão de
  //    login persistente, do jeito que o link real faz.
  const loginVisit = await request(`/c/${client.id}`);
  const clientCookieValue = cookieValue(loginVisit, "myde_cli");
  const clientCookie = `myde_cli=${encodeURIComponent(clientCookieValue)}`;

  // 4. GET / como essa carteira: catálogo vazio, botão de pedido visível
  //    já sugerindo o jogo certo (claimGameId), sem pedido pendente ainda.
  const home = await request("/", { headers: { Cookie: clientCookie } });
  assert.equal(home.statusCode, 200);
  assert.match(home.body, /id="empty-state-request-btn"/);
  assert.match(home.body, /Solicitar acesso a Flappy Bird/);
  assert.match(home.body, /__SUGGESTED_REQUEST__ = \{"gameId":"flappybird-nes"/);
  const homeCsrf = cookieValue(home, "myde_csrf");

  // 5. Clica (POST /api/access-requests) -- mesmo endpoint que /play/:id já
  //    usa, criando um pedido de verdade em lib/access-requests.js.
  const reqBody = JSON.stringify({ gameId: "flappybird-nes" });
  const sent = await request("/api/access-requests", {
    method: "POST",
    headers: {
      Cookie: `${clientCookie}; myde_csrf=${encodeURIComponent(homeCsrf)}`,
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(reqBody),
      "X-CSRF-Token": homeCsrf,
    },
    body: reqBody,
  });
  assert.equal(sent.statusCode, 200, sent.body);

  // 6. Recarrega / -- o botão agora reflete "aguardando aprovação",
  //    puxado do mesmo findPending() que a fila do admin usa.
  const homeAfter = await request("/", { headers: { Cookie: clientCookie } });
  assert.match(homeAfter.body, /Pedido enviado — aguardando aprovação/);
  assert.match(homeAfter.body, /id="empty-state-request-btn" disabled/);

  // 7. O pedido aparece na fila do admin, do jeito que já funciona hoje.
  const adminPage3 = await request("/admin", { headers: { Cookie: adminCookie } });
  const queue = await request("/admin/api/access-requests", { headers: { Cookie: `${adminCookie}; myde_csrf=${encodeURIComponent(cookieValue(adminPage3, "myde_csrf"))}` } });
  const pending = JSON.parse(queue.body).requests;
  assert.ok(pending.some((r) => r.clientLabel === "Jogador Sem Jogo" && r.gameTitle === "Flappy Bird"));
});

test("visitante SEM conta (não-cliente) não vê o botão de pedido — comportamento antigo preservado", async () => {
  const home = await request("/");
  assert.equal(home.statusCode, 200);
  assert.doesNotMatch(home.body, /id="empty-state-request-btn"/);
});
