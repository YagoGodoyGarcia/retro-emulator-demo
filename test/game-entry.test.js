const { test } = require("node:test");
const assert = require("node:assert/strict");
const gameEntry = require("../lib/game-entry");

test("slugify normaliza acento e espaço", () => {
  assert.equal(gameEntry.slugify("Ação-RPG: A Volta!"), "acao-rpg-a-volta");
});

test("slugify corta em 40 caracteres", () => {
  const long = "a".repeat(60);
  assert.equal(gameEntry.slugify(long).length, 40);
});

test("parseTags separa por vírgula, corta, minúsculo", () => {
  assert.deepEqual(gameEntry.parseTags(" Espaço, Guerra ,ação"), ["espaço", "guerra", "ação"]);
});

test("parseTags respeita o limite de 12 tags", () => {
  const many = Array.from({ length: 20 }, (_, i) => "tag" + i).join(",");
  assert.equal(gameEntry.parseTags(many).length, 12);
});

test("CORES vem de lib/platforms.js (sem variantes de controle tipo segaMD6)", () => {
  assert.deepEqual(gameEntry.CORES, ["nes", "snes", "gba", "segaMD"]);
});

test("CORE_EXTENSIONS bate com o mapeamento de plataformas", () => {
  assert.deepEqual(gameEntry.CORE_EXTENSIONS.segaMD, [".bin", ".md", ".gen"]);
  assert.deepEqual(gameEntry.CORE_EXTENSIONS.nes, [".nes"]);
});

test("buildGameUpdate exige título", () => {
  assert.throws(() => gameEntry.buildGameUpdate({ title: "  " }), gameEntry.ValidationError);
});
