const { test } = require("node:test");
const assert = require("node:assert/strict");
const accessLog = require("../lib/access-log");

test("relatório de acesso conta login, claim e partidas", async () => {
  const clientId = "log-test-" + Date.now();
  await accessLog.record(clientId, { type: "login", path: "/c/test" });
  await accessLog.record(clientId, { type: "claim", gameId: "sonic-the-hedgehog-2-2" });
  await accessLog.record(clientId, { type: "play", gameId: "sonic-the-hedgehog-2-2" });
  const report = await accessLog.summary(clientId);
  assert.equal(report.visits, 2);
  assert.equal(report.plays, 1);
  assert.equal(report.events.length, 3);
});
