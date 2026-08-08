require("dotenv").config();

const express = require("express");
const path = require("path");
const keychainsConfig = require("./config/keychains.json");

const app = express();
const PORT = process.env.PORT || 3000;

// CDN pública do EmulatorJS. Pode ser trocada via env sem mexer em código.
const EJS_CDN_URL = process.env.EMULATORJS_CDN_URL || "https://cdn.emulatorjs.org/stable/data/";

function loadKeychains() {
  const parsed = { ...keychainsConfig };
  delete parsed._comment;

  const keychains = {};
  for (const [keyId, cfg] of Object.entries(parsed)) {
    // Override por env var, ex: GAMEURL_FLAPPYBIRD_NES=https://.../outra-rom.nes
    const envKey = `GAMEURL_${keyId.toUpperCase().replace(/[^A-Z0-9]/g, "_")}`;
    keychains[keyId] = {
      ...cfg,
      gameId: cfg.gameId || keyId,
      gameUrl: process.env[envKey] || cfg.gameUrl,
    };
  }
  return keychains;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}

function escapeJs(str) {
  return JSON.stringify(String(str));
}

app.use(express.static(path.join(__dirname, "public")));

// GET / — index de teste: lista os "chaveiros" mockados
app.get("/", (req, res) => {
  const keychains = loadKeychains();

  const cards = Object.entries(keychains)
    .map(([keyId, cfg]) => `
      <a class="card" href="/play/${encodeURIComponent(keyId)}">
        <span class="card-core">${escapeHtml(cfg.core)}</span>
        <span class="card-title">${escapeHtml(cfg.title)}</span>
        <span class="card-keyid">keyId: ${escapeHtml(keyId)}</span>
      </a>
    `)
    .join("\n");

  res.send(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>Retro Emulator Demo — Chaveiros Mockados</title>
  <link rel="stylesheet" href="/css/style.css" />
</head>
<body class="index-body">
  <main class="index-wrap">
    <h1>Chaveiros mockados</h1>
    <p class="subtitle">
      Cada card simula a leitura de um chaveiro NFC. Na versão final, o NFC
      redireciona direto pra <code>/play/&lt;keyId&gt;</code> — aqui é só clicar.
    </p>
    <div class="card-grid">
      ${cards}
    </div>
  </main>
</body>
</html>`);
});

// GET /api/keychains — lista de chaveiros mockados em JSON (útil pra debug/integração)
app.get("/api/keychains", (req, res) => {
  const keychains = loadKeychains();
  res.json(keychains);
});

// GET /play/:keyId — player do EmulatorJS já configurado pro jogo daquele keyId
app.get("/play/:keyId", (req, res) => {
  const { keyId } = req.params;
  const keychains = loadKeychains();
  const cfg = keychains[keyId];

  if (!cfg) {
    const known = Object.keys(keychains).map((k) => `<li><a href="/play/${encodeURIComponent(k)}">${escapeHtml(k)}</a></li>`).join("");
    res.status(404).send(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Chaveiro não encontrado</title>
  <link rel="stylesheet" href="/css/style.css" />
</head>
<body class="index-body">
  <main class="index-wrap">
    <h1>Chaveiro "${escapeHtml(keyId)}" não encontrado</h1>
    <p class="subtitle">Chaveiros cadastrados em config/keychains.json:</p>
    <ul class="known-list">${known}</ul>
    <p><a href="/">&larr; voltar</a></p>
  </main>
</body>
</html>`);
    return;
  }

  res.send(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no" />
  <title>${escapeHtml(cfg.title)}</title>
  <link rel="stylesheet" href="/css/style.css" />
</head>
<body class="player-body">
  <div id="load-badge" class="load-badge">carregando core + rom...</div>
  <a href="/" class="back-btn" aria-label="Voltar">&larr;</a>
  <div id="game" class="game-container"></div>

  <script>
    (function () {
      var loadStartedAt = performance.now();
      var badge = document.getElementById("load-badge");

      window.EJS_player = "#game";
      window.EJS_core = ${escapeJs(cfg.core)};
      window.EJS_gameUrl = ${escapeJs(cfg.gameUrl)};
      window.EJS_pathtodata = ${escapeJs(EJS_CDN_URL)};
      // keyId = "chaveiro" lido; separa o save state de cada chaveiro no IndexedDB do navegador
      window.EJS_gameID = ${escapeJs(keyId)};
      window.EJS_gameName = ${escapeJs(cfg.title)};
      window.EJS_startOnLoaded = true;
      window.EJS_backgroundColor = "#000000";

      window.EJS_onGameStart = function () {
        var seconds = ((performance.now() - loadStartedAt) / 1000).toFixed(1);
        badge.textContent = "carregado em " + seconds + "s";
        console.log("[retro-demo] jogo iniciado em " + seconds + "s, keyId=" + ${escapeJs(keyId)});
        setTimeout(function () { badge.classList.add("load-badge--fade"); }, 2500);
      };

      window.EJS_onSaveState = function () {
        console.log("[retro-demo] save state gravado para keyId=" + ${escapeJs(keyId)});
      };

      window.EJS_onLoadState = function () {
        console.log("[retro-demo] save state carregado para keyId=" + ${escapeJs(keyId)});
      };
    })();
  </script>
  <script src="${EJS_CDN_URL}loader.js"></script>
</body>
</html>`);
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Retro emulator demo rodando em http://localhost:${PORT}`);
  });
}

module.exports = app;
