const { test } = require("node:test");
const assert = require("node:assert/strict");
const { normalizeGame } = require("../lib/library-service");

function raw(overrides) {
  return Object.assign(
    { gameId: "g1", title: "Jogo", core: "nes", gameUrl: "/roms/g1.nes", cover: "/covers/g1.png" },
    overrides
  );
}

test("jogo cadastrado pelo admin (source dynamic) é sempre featured, mesmo sem marcar", () => {
  const game = normalizeGame(raw({ featured: false }), "dynamic");
  assert.equal(game.featured, true);
});

test("jogo cadastrado pelo admin featured mesmo quando o campo nem existe", () => {
  const game = normalizeGame(raw({}), "dynamic");
  assert.equal(game.featured, true);
});

test("jogo estático (catálogo curado) respeita o featured salvo, não força true", () => {
  assert.equal(normalizeGame(raw({ featured: false }), "static").featured, false);
  assert.equal(normalizeGame(raw({ featured: true }), "static").featured, true);
});

test("jogo dinâmico com source já gravado no raw (vindo do Redis) também força featured", () => {
  const game = normalizeGame(raw({ featured: false, source: "dynamic" }), "static");
  assert.equal(game.featured, true);
});
