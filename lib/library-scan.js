/* "Verificar biblioteca" (Fase 9) — cruza o catálogo com o que existe de
 * verdade no Blob. Recebe as listas já buscadas (não faz rede aqui), pra
 * ficar testável sem token real nem Vercel Blob de verdade.
 */

const platforms = require("./platforms");

function scanLibrary(games, romBlobs, coverBlobs) {
  var romUrls = {};
  romBlobs.forEach(function (b) { romUrls[b.url] = true; });
  var coverUrls = {};
  coverBlobs.forEach(function (b) { coverUrls[b.url] = true; });

  var referencedRoms = {};
  var referencedCovers = {};
  var issues = [];

  games.forEach(function (g) {
    if (!g.gameUrl) issues.push({ gameId: g.gameId, title: g.title, type: "missing-rom" });
    if (!g.cover) issues.push({ gameId: g.gameId, title: g.title, type: "missing-cover" });
    if (!platforms.CORES.includes(g.core)) {
      issues.push({ gameId: g.gameId, title: g.title, type: "unknown-platform" });
    }

    // Só dá pra checar contra o Blob se a URL for de fato do Blob — um jogo
    // estático local usa caminho relativo (ex. /roms/flappybird.nes), que
    // nunca vai aparecer nessa listagem por design, não é órfão nem quebrado.
    if (g.gameUrl && romBlobs.length && /^https?:\/\//.test(g.gameUrl)) {
      referencedRoms[g.gameUrl] = true;
      if (!romUrls[g.gameUrl]) issues.push({ gameId: g.gameId, title: g.title, type: "broken-rom-url" });
    }
    if (g.cover && coverBlobs.length && /^https?:\/\//.test(g.cover)) {
      referencedCovers[g.cover] = true;
      if (!coverUrls[g.cover]) issues.push({ gameId: g.gameId, title: g.title, type: "broken-cover-url" });
    }
  });

  romBlobs.forEach(function (b) {
    if (!referencedRoms[b.url]) issues.push({ pathname: b.pathname, type: "orphan-rom" });
  });
  coverBlobs.forEach(function (b) {
    if (!referencedCovers[b.url]) issues.push({ pathname: b.pathname, type: "orphan-cover" });
  });

  // Duplicata por hash já é impedida no upload (Fase 3, POST
  // /admin/api/games e import-commit) — isso aqui só pega o caso residual
  // de duas entradas acabarem com o mesmo hash por outro caminho (edição
  // manual do config/keychains.json, por exemplo).
  var byHash = {};
  games.forEach(function (g) {
    if (!g.rom || !g.rom.hash) return;
    if (!byHash[g.rom.hash]) byHash[g.rom.hash] = [];
    byHash[g.rom.hash].push(g);
  });
  Object.keys(byHash).forEach(function (hash) {
    var group = byHash[hash];
    if (group.length > 1) {
      group.forEach(function (g) {
        issues.push({ gameId: g.gameId, title: g.title, type: "duplicate-hash" });
      });
    }
  });

  return issues;
}

module.exports = { scanLibrary };
