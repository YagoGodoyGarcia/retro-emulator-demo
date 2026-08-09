const { test } = require("node:test");
const assert = require("node:assert/strict");
const platforms = require("../lib/platforms");

test("detecta plataforma pela extensão", () => {
  assert.equal(platforms.detectByFilename("Mario.nes"), "nes");
  assert.equal(platforms.detectByFilename("Zelda.sfc"), "snes");
  assert.equal(platforms.detectByFilename("Zelda.smc"), "snes");
  assert.equal(platforms.detectByFilename("Pokemon.gba"), "gba");
  assert.equal(platforms.detectByFilename("Sonic3.gen"), "segaMD");
  assert.equal(platforms.detectByFilename("Sonic3.md"), "segaMD");
  assert.equal(platforms.detectByFilename("Sonic3.bin"), "segaMD");
});

test("extensão desconhecida não detecta nada", () => {
  assert.equal(platforms.detectByFilename("arquivo.zip"), null);
  assert.equal(platforms.detectByFilename(""), null);
});

test("CORES lista as 4 plataformas, sem variantes de controle", () => {
  assert.deepEqual(platforms.CORES, ["nes", "snes", "gba", "segaMD"]);
});

test("styleOf cai pro estilo padrão numa plataforma desconhecida", () => {
  assert.equal(platforms.styleOf("ps2").label, platforms.DEFAULT_STYLE.label);
});

test("list() vem ordenado por order", () => {
  const ids = platforms.list().map((p) => p.id);
  assert.deepEqual(ids, ["nes", "snes", "gba", "segaMD"]);
});
