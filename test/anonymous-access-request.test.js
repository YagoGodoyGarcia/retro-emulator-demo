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

// ACCESS_MODE=open: hoje qualquer um passa pelo requireAccess (gate de fora).
// O bug real era o gate de DENTRO de /play/:id deixar jogo sem dono passar
// pra quem não tem carteira nenhuma -- exatamente o cenário do relato (aba
// anônima do iPhone jogou o Sonic direto).

test("visitante 100% anônimo NÃO joga jogo sem dono nenhum -- vê formulário de solicitação", async () => {
  const play = await request("/play/cheril-nes"); // jogo do catálogo estático, sem dono nenhum
  assert.equal(play.statusCode, 403);
  assert.match(play.body, /id="anon-request-form"/);
  assert.doesNotMatch(play.body, /window\.__PLAY__/); // não é a página do jogo de verdade
});

test("visitante 100% anônimo NÃO joga jogo já atribuído a outra carteira -- mesmo formulário", async () => {
  // Atribui cheril-nes a uma carteira qualquer primeiro.
  const adminPage = await request("/admin", { headers: { Cookie: adminCookie } });
  const admin = adminCsrfCookie(adminPage);
  const createBody = JSON.stringify({ label: "Dono do Cheril", gameId: "cheril-nes" });
  await request("/admin/api/clients", {
    method: "POST",
    headers: { Cookie: admin.cookie, "Content-Type": "application/json", "Content-Length": Buffer.byteLength(createBody), "X-CSRF-Token": admin.token },
    body: createBody,
  });

  const play = await request("/play/cheril-nes");
  assert.equal(play.statusCode, 403);
  assert.match(play.body, /id="anon-request-form"/);
});

test("preencher o formulário anônimo sem CSRF é recusado", async () => {
  const play = await request("/play/driar-nes");
  const csrfToken = cookieValue(play, "myde_csrf");
  const body = JSON.stringify({ gameId: "driar-nes", name: "Visitante Teste" });
  const rejected = await request("/api/access-requests/anonymous", {
    method: "POST",
    headers: { Cookie: `myde_csrf=${encodeURIComponent(csrfToken)}`, "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
    body,
  });
  assert.equal(rejected.statusCode, 403);
});

test("preencher o formulário anônimo sem nome é recusado", async () => {
  const play = await request("/play/driar-nes");
  const csrfToken = cookieValue(play, "myde_csrf");
  const body = JSON.stringify({ gameId: "driar-nes", name: "" });
  const rejected = await request("/api/access-requests/anonymous", {
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

test("fluxo completo: formulário anônimo cria carteira real + pedido pendente, aparece na fila do admin, some após aprovar, e o jogo passa a abrir", async () => {
  const gameId = "bootee-nes";

  const play = await request(`/play/${gameId}`);
  assert.equal(play.statusCode, 403);
  const csrfToken = cookieValue(play, "myde_csrf");

  const body = JSON.stringify({ gameId, name: "Visitante do TikTok", email: "visitante@example.com" });
  const sent = await request("/api/access-requests/anonymous", {
    method: "POST",
    headers: {
      Cookie: `myde_csrf=${encodeURIComponent(csrfToken)}`,
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(body),
      "X-CSRF-Token": csrfToken,
    },
    body,
  });
  assert.equal(sent.statusCode, 200, sent.body);
  const clientCookieValue = cookieValue(sent, "myde_cli");
  const clientCookie = `myde_cli=${encodeURIComponent(clientCookieValue)}`;

  // O pedido aparece na fila do admin, marcado como veio do formulário.
  const adminPage1 = await request("/admin", { headers: { Cookie: adminCookie } });
  const admin1 = adminCsrfCookie(adminPage1);
  const queue1 = await request("/admin/api/access-requests", { headers: { Cookie: admin1.cookie } });
  const pendingRow = JSON.parse(queue1.body).requests.find((r) => r.clientLabel === "Visitante do TikTok" && r.gameTitle);
  assert.ok(pendingRow, "pedido do visitante anônimo não apareceu na fila");

  const clientsList = await request("/admin/api/clients", { headers: { Cookie: admin1.cookie } });
  const createdClient = JSON.parse(clientsList.body).clients.find((c) => c.label === "Visitante do TikTok");
  assert.ok(createdClient, "carteira do visitante não foi criada");
  assert.equal(createdClient.source, "form");

  // Reabrir o jogo AGORA (já com sessão de carteira) mostra "aguardando
  // aprovação" pelo fluxo JÁ EXISTENTE de requestAccessPage -- confirma que
  // a transição do formulário anônimo pro fluxo normal de carteira é limpa.
  const playAgain = await request(`/play/${gameId}`, { headers: { Cookie: clientCookie } });
  assert.equal(playAgain.statusCode, 403);
  assert.match(playAgain.body, /Pedido enviado — aguardando aprovação/);
  assert.match(playAgain.body, /disabled/);

  // Admin aprova.
  const adminPage2 = await request("/admin", { headers: { Cookie: adminCookie } });
  const admin2 = adminCsrfCookie(adminPage2);
  const approved = await request(`/admin/api/access-requests/${pendingRow.id}/approve`, {
    method: "POST",
    headers: { Cookie: admin2.cookie, "X-CSRF-Token": admin2.token },
  });
  assert.equal(approved.statusCode, 200, approved.body);

  // Fila fica vazia, jogo agora abre de verdade.
  const adminPage3 = await request("/admin", { headers: { Cookie: adminCookie } });
  const admin3 = adminCsrfCookie(adminPage3);
  const queue2 = await request("/admin/api/access-requests", { headers: { Cookie: admin3.cookie } });
  assert.equal(JSON.parse(queue2.body).requests.some((r) => r.id === pendingRow.id), false);

  const playFinal = await request(`/play/${gameId}`, { headers: { Cookie: clientCookie } });
  assert.equal(playFinal.statusCode, 200);
  assert.match(playFinal.body, /window\.__PLAY__/);
});

test("REGRESSÃO: carteira legítima (/c/:id) continua jogando o próprio jogo sem passar pelo gate anônimo", async () => {
  const adminPage = await request("/admin", { headers: { Cookie: adminCookie } });
  const admin = adminCsrfCookie(adminPage);
  const createBody = JSON.stringify({ label: "Carteira Legítima", gameId: "ababol-nes" });
  const created = await request("/admin/api/clients", {
    method: "POST",
    headers: { Cookie: admin.cookie, "Content-Type": "application/json", "Content-Length": Buffer.byteLength(createBody), "X-CSRF-Token": admin.token },
    body: createBody,
  });
  assert.equal(created.statusCode, 200, created.body);
  const client = JSON.parse(created.body).client;

  // Visita o link de carteira de verdade -- é assim que uma pessoa real
  // chega, não direto em /play/:id.
  const loginVisit = await request(`/c/${client.id}`);
  const clientCookieValue = cookieValue(loginVisit, "myde_cli");
  const clientCookie = `myde_cli=${encodeURIComponent(clientCookieValue)}`;

  const play = await request("/play/ababol-nes", { headers: { Cookie: clientCookie } });
  assert.equal(play.statusCode, 200, play.body);
  assert.match(play.body, /window\.__PLAY__/);
  assert.doesNotMatch(play.body, /anon-request-form/);
});

test("REGRESSÃO: admin continua jogando qualquer jogo direto, sem gate nenhum", async () => {
  const play = await request("/play/skipp-snes", { headers: { Cookie: adminCookie } });
  assert.equal(play.statusCode, 200, play.body);
  assert.match(play.body, /window\.__PLAY__/);
});

test("REGRESSÃO: home (vitrine) continua acessível e mostrando o catálogo pra visitante anônimo", async () => {
  const home = await request("/");
  assert.equal(home.statusCode, 200);
  assert.match(home.body, /class="tile/);
});
