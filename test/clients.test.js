const { test } = require("node:test");
const assert = require("node:assert/strict");
const clients = require("../lib/clients");

test("cliente novo sem nome fica pendente e pode ser reivindicado", () => {
  const client = clients.newClient("", "");
  assert.equal(client.label, "");
  assert.equal(client.claimedAt, null);
  const result = clients.claim(client, " Ana  Mobile ", "ANA@example.com ");
  assert.equal(result.ok, true);
  assert.equal(client.label, "Ana Mobile");
  assert.equal(client.email, "ana@example.com");
  assert.ok(client.claimedAt);
});

test("claim recusa nome curto e e-mail inválido", () => {
  const client = clients.newClient("", "");
  assert.equal(clients.claim(client, "A", "").ok, false);
  assert.equal(clients.claim(client, "Ana", "not-an-email").ok, false);
});

test("claim não permite reutilizar link já cadastrado", () => {
  const client = clients.newClient("Ana", "ana@example.com");
  const result = clients.claim(client, "Outra pessoa", "outra@example.com");
  assert.equal(result.ok, false);
  assert.match(result.error, /já foi cadastrado/);
});
