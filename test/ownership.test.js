const { test } = require("node:test");
const assert = require("node:assert/strict");
const ownership = require("../lib/ownership");

test("jogo sem dono não tem owner", async () => {
  assert.equal(await ownership.getOwner("jogo-livre"), null);
});

test("setOwner atribui e getOwner reflete na hora", async () => {
  await ownership.setOwner("jogo-a", "cliente-1");
  assert.equal(await ownership.getOwner("jogo-a"), "cliente-1");
  assert.deepEqual(await ownership.getClientGames("cliente-1"), ["jogo-a"]);
});

test("reatribuir a outro cliente troca o dono, não soma", async () => {
  await ownership.setOwner("jogo-b", "cliente-1");
  await ownership.setOwner("jogo-b", "cliente-2");
  assert.equal(await ownership.getOwner("jogo-b"), "cliente-2");
  assert.deepEqual(await ownership.getClientGames("cliente-2"), ["jogo-b"]);
  assert.equal((await ownership.getClientGames("cliente-1")).includes("jogo-b"), false);
});

test("removeOwner libera o jogo e tira da lista do cliente", async () => {
  await ownership.setOwner("jogo-c", "cliente-3");
  await ownership.removeOwner("jogo-c");
  assert.equal(await ownership.getOwner("jogo-c"), null);
  assert.equal((await ownership.getClientGames("cliente-3")).includes("jogo-c"), false);
});
