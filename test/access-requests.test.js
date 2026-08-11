const { test } = require("node:test");
const assert = require("node:assert/strict");
const accessRequests = require("../lib/access-requests");

test("createRequest cria um pedido pendente", async () => {
  const r = await accessRequests.createRequest("cli-1", "jogo-a");
  assert.equal(r.status, "pending");
  assert.equal(r.clientId, "cli-1");
  assert.equal(r.gameId, "jogo-a");
});

test("pedir o mesmo jogo de novo com pedido pendente devolve o mesmo pedido, não duplica", async () => {
  const first = await accessRequests.createRequest("cli-2", "jogo-b");
  const second = await accessRequests.createRequest("cli-2", "jogo-b");
  assert.equal(first.id, second.id);
});

test("resolveRequest aprova e some da lista de pendentes", async () => {
  const r = await accessRequests.createRequest("cli-3", "jogo-c");
  const resolved = await accessRequests.resolveRequest(r.id, "approved");
  assert.equal(resolved.status, "approved");
  assert.ok(resolved.resolvedAt);

  const pending = await accessRequests.listPending();
  assert.equal(pending.some((p) => p.id === r.id), false);
});

test("depois de resolvido, pedir de novo o mesmo jogo cria um pedido novo", async () => {
  const r1 = await accessRequests.createRequest("cli-4", "jogo-d");
  await accessRequests.resolveRequest(r1.id, "denied");
  const r2 = await accessRequests.createRequest("cli-4", "jogo-d");
  assert.notEqual(r1.id, r2.id);
  assert.equal(r2.status, "pending");
});

test("listOtherPendingForGame ignora o próprio pedido e pedidos de outros jogos", async () => {
  const mine = await accessRequests.createRequest("cli-5", "jogo-e");
  const other = await accessRequests.createRequest("cli-6", "jogo-e");
  await accessRequests.createRequest("cli-7", "jogo-outro");

  const others = await accessRequests.listOtherPendingForGame("jogo-e", mine.id);
  assert.equal(others.length, 1);
  assert.equal(others[0].id, other.id);
});
