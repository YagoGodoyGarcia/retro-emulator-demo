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

// Estilo visual por core, só pra deixar os cards da tela inicial mais convidativos
const CORE_STYLE = {
  nes: { glyph: "👾", from: "#8b5cf6", to: "#2e1065", accent: "#c4b5fd" },
  snes: { glyph: "🎮", from: "#14b8a6", to: "#0f3d38", accent: "#5eead4" },
};
const DEFAULT_CORE_STYLE = { glyph: "🕹️", from: "#64748b", to: "#1e293b", accent: "#cbd5e1" };

// iOS (Safari e qualquer outro navegador lá, todos rodam em cima da WebKit)
// não deixa esconder a barra de endereço/abas de uma aba normal — só quando
// a página é aberta a partir de um ícone salvo na Tela de Início. Essas tags
// habilitam esse modo "standalone" sem barra nenhuma quando o usuário salva.
const PWA_HEAD = `
  <link rel="manifest" href="/manifest.webmanifest" />
  <meta name="theme-color" content="#0b0b12" />
  <meta name="mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
  <meta name="apple-mobile-web-app-title" content="Joga Retrô" />
  <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />`;

app.use(express.static(path.join(__dirname, "public")));

// GET / — tela inicial: lista os jogos disponíveis
app.get("/", (req, res) => {
  const keychains = loadKeychains();

  const cards = Object.entries(keychains)
    .map(([keyId, cfg]) => {
      const style = CORE_STYLE[cfg.core] || DEFAULT_CORE_STYLE;
      return `
      <a class="card" href="/play/${encodeURIComponent(keyId)}" style="--accent:${style.accent};--cover-from:${style.from};--cover-to:${style.to}">
        <div class="card-cover" aria-hidden="true">
          <span class="card-cover-glyph">${style.glyph}</span>
        </div>
        <div class="card-body">
          <span class="card-console-tag">${escapeHtml(cfg.core)}</span>
          <span class="card-title">${escapeHtml(cfg.title)}</span>
          <span class="card-cta">Jogar agora
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>
          </span>
        </div>
      </a>
    `;
    })
    .join("\n");

  res.send(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>Joga Retrô</title>
  <link rel="stylesheet" href="/css/style.css" />${PWA_HEAD}
</head>
<body class="index-body">
  <main class="index-wrap">
    <header class="hero">
      <div class="hero-badge">🕹️</div>
      <h1>Joga Retrô</h1>
      <p class="hero-tagline">Escolhe um jogo e começa a jogar na hora — seu progresso fica salvo automaticamente.</p>
    </header>

    <div class="card-grid">
      ${cards}
    </div>

    <div id="ios-hint" class="ios-hint" hidden>
      <span>📲 No iPhone, pra jogar sem a barra do navegador: toque em <strong>Compartilhar</strong> → <strong>Adicionar à Tela de Início</strong>.</span>
      <button type="button" id="ios-hint-close" class="ios-hint-close" aria-label="Fechar dica">&times;</button>
    </div>
  </main>

  <script>
    (function () {
      var isIos = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
      var isStandalone = window.navigator.standalone === true || window.matchMedia("(display-mode: standalone)").matches;
      var dismissed = localStorage.getItem("retro-demo-ios-hint-dismissed") === "1";
      if (isIos && !isStandalone && !dismissed) {
        var hint = document.getElementById("ios-hint");
        hint.hidden = false;
        document.getElementById("ios-hint-close").addEventListener("click", function () {
          hint.hidden = true;
          localStorage.setItem("retro-demo-ios-hint-dismissed", "1");
        });
      }
    })();
  </script>
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
  <title>Jogo não encontrado</title>
  <link rel="stylesheet" href="/css/style.css" />${PWA_HEAD}
</head>
<body class="index-body">
  <main class="index-wrap">
    <h1>Jogo "${escapeHtml(keyId)}" não encontrado</h1>
    <p class="subtitle">IDs cadastrados em config/keychains.json:</p>
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
  <link rel="stylesheet" href="/css/style.css" />${PWA_HEAD}
</head>
<body class="player-body">
  <div id="load-badge" class="load-badge">carregando core + rom...</div>
  <a href="/" class="back-btn" aria-label="Voltar">&larr;</a>
  <div id="game" class="game-container"></div>

  <div id="play-gate" class="play-gate">
    <div class="play-gate-inner">
      <button type="button" id="play-gate-btn" class="play-gate-btn" aria-label="Jogar">▶</button>
      <div class="play-gate-title">${escapeHtml(cfg.title)}</div>
      <div id="play-gate-hint" class="play-gate-hint">Toque para jogar</div>
    </div>
  </div>

  <script>
    (function () {
      var loadStartedAt = performance.now();
      var badge = document.getElementById("load-badge");

      window.EJS_player = "#game";
      window.EJS_core = ${escapeJs(cfg.core)};
      window.EJS_gameUrl = ${escapeJs(cfg.gameUrl)};
      window.EJS_pathtodata = ${escapeJs(EJS_CDN_URL)};
      // Identificador do jogo, usado pelo EmulatorJS pra separar o save state de cada jogo no IndexedDB do navegador
      window.EJS_gameID = ${escapeJs(keyId)};
      window.EJS_gameName = ${escapeJs(cfg.title)};
      window.EJS_startOnLoaded = true;
      window.EJS_backgroundColor = "#000000";

      window.EJS_onGameStart = function () {
        var seconds = ((performance.now() - loadStartedAt) / 1000).toFixed(1);
        badge.textContent = "carregado em " + seconds + "s";
        console.log("[retro-demo] jogo iniciado em " + seconds + "s, id=" + ${escapeJs(keyId)});
        setTimeout(function () { badge.classList.add("load-badge--fade"); }, 2500);
      };

      window.EJS_onSaveState = function () {
        console.log("[retro-demo] save state gravado para id=" + ${escapeJs(keyId)});
      };

      window.EJS_onLoadState = function () {
        console.log("[retro-demo] save state carregado para id=" + ${escapeJs(keyId)});
      };

      // Tela cheia real, giro pra paisagem e som exigem um toque do usuário
      // pra funcionar nos navegadores mobile — não rola disparar isso sozinho
      // no load. Esse botão é justamente esse toque.
      //
      // No iOS (Safari, Chrome, qualquer um — todos rodam em cima da WebKit),
      // requestFullscreen() de página normal simplesmente não existe: o único
      // jeito de sumir com a barra do navegador lá é abrir a partir de um
      // ícone salvo na Tela de Início (ver dica na tela inicial). Por isso o
      // texto do botão só promete "tela cheia" quando o navegador realmente
      // suporta.
      var canFullscreen = !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);
      var isStandalone = window.navigator.standalone === true || window.matchMedia("(display-mode: standalone)").matches;
      var hint = document.getElementById("play-gate-hint");
      if (canFullscreen && !isStandalone) {
        hint.textContent = "Toque para jogar em tela cheia";
      }

      var gate = document.getElementById("play-gate");
      function dismissGate() {
        gate.classList.add("play-gate--hidden");
        setTimeout(function () { gate.remove(); }, 300);
      }
      gate.addEventListener("click", function () {
        var el = document.documentElement;
        var request = canFullscreen
          ? ((el.requestFullscreen && el.requestFullscreen()) || (el.webkitRequestFullscreen && el.webkitRequestFullscreen()))
          : null;
        Promise.resolve(request).catch(function () {}).then(function () {
          document.documentElement.classList.add("force-landscape");
          try {
            if (screen.orientation && screen.orientation.lock) {
              screen.orientation.lock("landscape").catch(function () {});
            }
          } catch (e) {}
        });
        if ("wakeLock" in navigator) {
          navigator.wakeLock.request("screen").catch(function () {});
        }
        dismissGate();
      }, { once: true });
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
