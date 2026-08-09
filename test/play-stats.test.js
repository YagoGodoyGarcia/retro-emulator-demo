const { test } = require("node:test");
const assert = require("node:assert/strict");
const playStats = require("../lib/play-stats");

test("increment soma jogadas por gameId (modo memória, sem Redis configurado)", async () => {
  await playStats.increment("jogo-x");
  await playStats.increment("jogo-x");
  await playStats.increment("jogo-y");
  const counts = await playStats.getCounts(["jogo-x", "jogo-y", "jogo-nunca-jogado"]);
  assert.equal(counts["jogo-x"], 2);
  assert.equal(counts["jogo-y"], 1);
  assert.equal(counts["jogo-nunca-jogado"], 0);
});

test("increment sem gameId não quebra", async () => {
  await playStats.increment(undefined);
  await playStats.increment("");
});
