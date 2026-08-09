const { test } = require("node:test");
const assert = require("node:assert/strict");
const { hashBuffer } = require("../lib/rom-hash");

test("mesmo conteúdo produz o mesmo hash", () => {
  const a = Buffer.from("conteudo-da-rom");
  const b = Buffer.from("conteudo-da-rom");
  assert.equal(hashBuffer(a), hashBuffer(b));
});

test("conteúdo diferente produz hash diferente", () => {
  const a = Buffer.from("conteudo-da-rom-1");
  const b = Buffer.from("conteudo-da-rom-2");
  assert.notEqual(hashBuffer(a), hashBuffer(b));
});

test("é sha-256 (64 caracteres hex)", () => {
  const hash = hashBuffer(Buffer.from("qualquer coisa"));
  assert.match(hash, /^[0-9a-f]{64}$/);
});
