const { test } = require("node:test");
const assert = require("node:assert/strict");
const { reviewUploadRequest, BlobUploadError } = require("../lib/blob-upload-policy");

function payload(kind, platform) {
  return JSON.stringify({ kind, platform });
}

test("aprova rom no destino esperado", () => {
  const result = reviewUploadRequest("roms/nes/mario.nes", payload("roms", "nes"));
  assert.equal(result.maximumSizeInBytes, 1 * 1024 * 1024);
  assert.deepEqual(result.allowedContentTypes, ["*/*"]);
});

test("aprova capa no destino esperado", () => {
  const result = reviewUploadRequest("covers/gba/pokemon.png", payload("covers", "gba"));
  assert.deepEqual(result.allowedContentTypes, ["image/*"]);
});

test("recusa kind inválido", () => {
  assert.throws(() => reviewUploadRequest("roms/nes/mario.nes", payload("saves", "nes")), BlobUploadError);
});

test("recusa plataforma inválida", () => {
  assert.throws(() => reviewUploadRequest("roms/ps2/game.iso", payload("roms", "ps2")), BlobUploadError);
});

test("recusa pathname fora do prefixo esperado (cliente tentando escolher destino livre)", () => {
  assert.throws(
    () => reviewUploadRequest("roms/qualquer-coisa/arquivo.nes", payload("roms", "nes")),
    BlobUploadError
  );
});

test("recusa subpasta extra dentro do destino", () => {
  assert.throws(() => reviewUploadRequest("roms/nes/sub/mario.nes", payload("roms", "nes")), BlobUploadError);
});

test("recusa path traversal", () => {
  assert.throws(() => reviewUploadRequest("roms/nes/../../secreto.nes", payload("roms", "nes")), BlobUploadError);
});

test("recusa extensão que não combina com a plataforma", () => {
  assert.throws(() => reviewUploadRequest("roms/nes/mario.gba", payload("roms", "nes")), BlobUploadError);
});

test("recusa clientPayload que não é JSON", () => {
  assert.throws(() => reviewUploadRequest("roms/nes/mario.nes", "não é json"), BlobUploadError);
});

test("cada plataforma tem seu próprio limite de tamanho", () => {
  const nes = reviewUploadRequest("roms/nes/a.nes", payload("roms", "nes"));
  const gba = reviewUploadRequest("roms/gba/a.gba", payload("roms", "gba"));
  assert.ok(gba.maximumSizeInBytes > nes.maximumSizeInBytes);
});
