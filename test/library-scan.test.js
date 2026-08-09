const { test } = require("node:test");
const assert = require("node:assert/strict");
const { scanLibrary } = require("../lib/library-scan");

function game(overrides) {
  return Object.assign(
    { gameId: "g1", title: "Jogo", core: "nes", gameUrl: "/roms/g1.nes", cover: "/covers/g1.png", rom: {} },
    overrides
  );
}

test("biblioteca saudável não gera nenhum problema", () => {
  const issues = scanLibrary([game()], [], []);
  assert.deepEqual(issues, []);
});

test("detecta jogo sem ROM e sem capa", () => {
  const issues = scanLibrary([game({ gameUrl: "", cover: "" })], [], []);
  const types = issues.map((i) => i.type).sort();
  assert.deepEqual(types, ["missing-cover", "missing-rom"]);
});

test("detecta plataforma desconhecida", () => {
  const issues = scanLibrary([game({ core: "ps2" })], [], []);
  assert.ok(issues.some((i) => i.type === "unknown-platform"));
});

test("URL de Blob que não existe mais é rom quebrada, não órfã", () => {
  const g = game({ gameUrl: "https://blob.example/roms/nes/sumiu.nes" });
  const issues = scanLibrary([g], [{ url: "https://blob.example/roms/nes/outro.nes", pathname: "roms/nes/outro.nes" }], []);
  assert.ok(issues.some((i) => i.type === "broken-rom-url" && i.gameId === "g1"));
});

test("arquivo no Blob sem nenhum jogo apontando é órfão", () => {
  const g = game({ gameUrl: "https://blob.example/roms/nes/usado.nes" });
  const romBlobs = [
    { url: "https://blob.example/roms/nes/usado.nes", pathname: "roms/nes/usado.nes" },
    { url: "https://blob.example/roms/nes/orfao.nes", pathname: "roms/nes/orfao.nes" },
  ];
  const issues = scanLibrary([g], romBlobs, []);
  assert.deepEqual(
    issues.filter((i) => i.type === "orphan-rom").map((i) => i.pathname),
    ["roms/nes/orfao.nes"]
  );
});

test("jogo estático com caminho relativo nunca gera falso positivo de quebrado", () => {
  const g = game({ gameUrl: "/roms/flappybird.nes" });
  const issues = scanLibrary([g], [{ url: "https://blob.example/roms/nes/outro.nes", pathname: "x" }], []);
  assert.equal(issues.some((i) => i.type === "broken-rom-url"), false);
});

test("dois jogos com o mesmo hash de ROM viram duplicate-hash", () => {
  const a = game({ gameId: "a", rom: { hash: "abc" } });
  const b = game({ gameId: "b", rom: { hash: "abc" } });
  const issues = scanLibrary([a, b], [], []);
  const dupIds = issues.filter((i) => i.type === "duplicate-hash").map((i) => i.gameId).sort();
  assert.deepEqual(dupIds, ["a", "b"]);
});

test("hashes diferentes não disparam duplicate-hash", () => {
  const a = game({ gameId: "a", rom: { hash: "abc" } });
  const b = game({ gameId: "b", rom: { hash: "def" } });
  const issues = scanLibrary([a, b], [], []);
  assert.equal(issues.some((i) => i.type === "duplicate-hash"), false);
});
