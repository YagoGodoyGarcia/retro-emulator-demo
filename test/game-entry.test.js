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
  ["nes", "snes", "gba", "segaMD"].forEach((id) => assert.ok(gameEntry.CORES.includes(id)));
  assert.equal(gameEntry.CORES.includes("segaMD6"), false);
});

test("CORE_EXTENSIONS bate com o mapeamento de plataformas", () => {
  assert.deepEqual(gameEntry.CORE_EXTENSIONS.segaMD, [".bin", ".md", ".gen", ".smd"]);
  assert.deepEqual(gameEntry.CORE_EXTENSIONS.nes, [".nes"]);
});

test("buildGameUpdate exige título", () => {
  assert.throws(() => gameEntry.buildGameUpdate({ title: "  " }), gameEntry.ValidationError);
});

test("buildGameUpdate aceita status válido", () => {
  const result = gameEntry.buildGameUpdate({ title: "Jogo", status: "published" });
  assert.equal(result.status, "published");
});

test("buildGameUpdate recusa status inválido", () => {
  assert.throws(
    () => gameEntry.buildGameUpdate({ title: "Jogo", status: "publicadíssimo" }),
    gameEntry.ValidationError
  );
});

test("buildGameUpdate converte featured de string (FormData) pra boolean", () => {
  assert.equal(gameEntry.buildGameUpdate({ title: "Jogo", featured: "true" }).featured, true);
  assert.equal(gameEntry.buildGameUpdate({ title: "Jogo", featured: "false" }).featured, false);
});

test("buildGameUpdate sem featured não mexe no campo (edição em massa de outra coisa não desmarca destaque)", () => {
  const result = gameEntry.buildGameUpdate({ title: "Jogo" });
  assert.equal("featured" in result, false);
});

test("buildGameUpdate sem status não mexe no campo", () => {
  const result = gameEntry.buildGameUpdate({ title: "Jogo" });
  assert.equal("status" in result, false);
});

test("buildImportEntry aprova entrada completa e devolve id único", () => {
  const existingIds = new Set(["mario-bros"]);
  const { id, entry } = gameEntry.buildImportEntry(
    {
      title: "Mario Bros",
      core: "nes",
      genre: "Plataforma",
      tags: "mario, classico",
      confirmRights: "true",
      gameUrl: "https://blob.example/roms/nes/mario-bros.nes",
      romFilename: "mario-bros.nes",
    },
    existingIds
  );
  assert.equal(id, "mario-bros-2");
  assert.equal(entry.core, "nes");
  assert.equal(entry.title, "Mario Bros");
  assert.deepEqual(entry.tags, ["mario", "classico"]);
});

test("buildImportEntry exige confirmação de direitos mesmo em lote", () => {
  assert.throws(
    () =>
      gameEntry.buildImportEntry(
        { title: "Jogo", core: "nes", gameUrl: "https://x/roms/nes/a.nes", romFilename: "a.nes" },
        new Set()
      ),
    gameEntry.ValidationError
  );
});

test("buildImportEntry recusa extensão que não combina com o console", () => {
  assert.throws(
    () =>
      gameEntry.buildImportEntry(
        {
          title: "Jogo",
          core: "nes",
          confirmRights: "true",
          gameUrl: "https://x/roms/nes/a.gba",
          romFilename: "a.gba",
        },
        new Set()
      ),
    gameEntry.ValidationError
  );
});

test("buildImportEntry exige gameUrl (rom já precisa estar no Blob)", () => {
  assert.throws(
    () =>
      gameEntry.buildImportEntry(
        { title: "Jogo", core: "nes", confirmRights: "true", romFilename: "a.nes" },
        new Set()
      ),
    gameEntry.ValidationError
  );
});
