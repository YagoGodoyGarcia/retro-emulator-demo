const { test } = require("node:test");
const assert = require("node:assert/strict");
const platforms = require("../lib/platforms");

test("detecta plataforma pela extensão quando ela é exclusiva de uma só", () => {
  assert.equal(platforms.detectByFilename("Mario.nes"), "nes");
  assert.equal(platforms.detectByFilename("Zelda.sfc"), "snes");
  assert.equal(platforms.detectByFilename("Zelda.smc"), "snes");
  assert.equal(platforms.detectByFilename("Pokemon.gba"), "gba");
  assert.equal(platforms.detectByFilename("Sonic3.gen"), "segaMD");
  assert.equal(platforms.detectByFilename("Sonic3.md"), "segaMD");
  assert.equal(platforms.detectByFilename("Mario64.z64"), "n64");
  assert.equal(platforms.detectByFilename("Pokemon.gbc"), "gb");
});

test("extensão ambígua entre várias plataformas não escolhe sozinha (seção 15 do briefing)", () => {
  // .bin hoje é usado por segaMD, atari2600, atari7800, atari5200 e
  // sega32x — nenhuma vitória automática, quem chama precisa perguntar.
  assert.equal(platforms.detectByFilename("Sonic3.bin"), null);
});

test("disco (.cue/.iso/.chd) nunca detecta sozinho — compartilhado por vários sistemas de CD", () => {
  assert.equal(platforms.detectByFilename("jogo.cue"), null);
  assert.equal(platforms.detectByFilename("jogo.iso"), null);
  assert.equal(platforms.detectByFilename("jogo.chd"), null);
});

test("archive (.zip) nunca detecta sozinho — arcade/MAME/DOS dividem a extensão", () => {
  assert.equal(platforms.detectByFilename("romset.zip"), null);
});

test("extensão desconhecida não detecta nada", () => {
  assert.equal(platforms.detectByFilename("arquivo.xyz"), null);
  assert.equal(platforms.detectByFilename(""), null);
});

test("CORES inclui as 4 plataformas de produção e não inclui PS2 (fora de escopo, seção 35)", () => {
  ["nes", "snes", "gba", "segaMD"].forEach((id) => assert.ok(platforms.CORES.includes(id)));
  assert.equal(platforms.CORES.includes("ps2"), false);
});

test("styleOf cai pro estilo padrão numa plataforma desconhecida", () => {
  assert.equal(platforms.styleOf("ps2").label, platforms.DEFAULT_STYLE.label);
});

test("list() vem ordenado por order, produção primeiro", () => {
  const ids = platforms.list().map((p) => p.id);
  assert.deepEqual(ids.slice(0, 4), ["nes", "snes", "gba", "segaMD"]);
});

test("plataforma com BIOS documenta os arquivos, sem colocar BIOS de verdade no repo", () => {
  const psx = platforms.get("psx");
  assert.equal(psx.requiresBios, true);
  assert.ok(psx.biosFiles.length > 0);
});

test("plataforma sem BIOS não exige nada", () => {
  const nes = platforms.get("nes");
  assert.equal(nes.requiresBios, false);
  assert.deepEqual(nes.biosFiles, []);
});

test("cada plataforma tem um maxRomBytes coerente (disco/cartucho grande > cartucho pequeno)", () => {
  assert.ok(platforms.get("gba").maxRomBytes > platforms.get("nes").maxRomBytes);
  assert.ok(platforms.get("n64").maxRomBytes >= platforms.get("gba").maxRomBytes);
});
