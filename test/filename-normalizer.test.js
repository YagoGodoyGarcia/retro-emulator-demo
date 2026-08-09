const { test } = require("node:test");
const assert = require("node:assert/strict");
const { normalizeFilenameToTitle } = require("../lib/filename-normalizer");

test("remove tag de região simples", () => {
  assert.equal(normalizeFilenameToTitle("Super Mario Bros (U).nes"), "Super Mario Bros");
});

test("remove múltiplas tags (região + revisão)", () => {
  assert.equal(normalizeFilenameToTitle("Donkey Kong (U) (PRG1).nes"), "Donkey Kong");
});

test("remove tag composta com vírgula", () => {
  assert.equal(normalizeFilenameToTitle("Sonic The Hedgehog 3 (USA, Europe).gen"), "Sonic The Hedgehog 3");
});

test("preserva subtítulo com hífen (não é tag)", () => {
  assert.equal(
    normalizeFilenameToTitle("The Legend of Zelda - A Link to the Past.sfc"),
    "The Legend of Zelda - A Link to the Past"
  );
});

test("remove tag de dump entre colchetes", () => {
  assert.equal(normalizeFilenameToTitle("Pokemon - Emerald Version [!].gba"), "Pokemon - Emerald Version");
});

test("arquivo sem tag nenhuma fica igual, só sem extensão", () => {
  assert.equal(normalizeFilenameToTitle("Flappy Bird.nes"), "Flappy Bird");
});

test("nome que vira vazio depois de tirar as tags cai pro nome original", () => {
  assert.equal(normalizeFilenameToTitle("(U) [!].nes"), "(U) [!]");
});

test("sem extensão não quebra", () => {
  assert.equal(normalizeFilenameToTitle("Metroid (U)"), "Metroid");
});
