require("dotenv").config();

const express = require("express");
const path = require("path");
const keychainsConfig = require("./config/keychains.json");

const app = express();
const PORT = process.env.PORT || 3000;

// CDN pública do EmulatorJS. Pode ser trocada via env sem mexer em código.
const EJS_CDN_URL = process.env.EMULATORJS_CDN_URL || "https://cdn.emulatorjs.org/stable/data/";

// Qual arquivo de core o EmulatorJS baixa pra cada sistema. Vem da lista
// oficial dele (data/src/consts.js) — ele usa o primeiro core de cada
// sistema. Serve só pro pré-aquecimento na vitrine: com o core já no cache
// HTTP, abrir o jogo fica muito mais rápido.
const CORE_FILE = {
  nes: "fceumm",
  snes: "snes9x",
  gba: "mgba",
  segaMD: "genesis_plus_gx",
};

function loadKeychains() {
  const parsed = { ...keychainsConfig };
  delete parsed._comment;

  const keychains = {};
  for (const [keyId, cfg] of Object.entries(parsed)) {
    // Override por env var, ex: GAMEURL_FLAPPYBIRD_NES=https://.../outra.nes
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

// JSON embutido em <script>: além de escapar aspas, precisa quebrar qualquer
// "</script>" que apareça dentro de um valor, senão fecha a tag no meio.
function jsonForScript(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

const CORE_STYLE = {
  nes: { label: "NES", from: "#8b5cf6", to: "#2e1065", accent: "#c4b5fd" },
  snes: { label: "SNES", from: "#14b8a6", to: "#0f3d38", accent: "#5eead4" },
  gba: { label: "GBA", from: "#f59e0b", to: "#7c2d12", accent: "#fcd34d" },
  segaMD: { label: "MEGA DRIVE", from: "#3b82f6", to: "#1e1b4b", accent: "#93c5fd" },
};
const DEFAULT_CORE_STYLE = { label: "RETRO", from: "#64748b", to: "#1e293b", accent: "#cbd5e1" };

// Layout do controle virtual por core — mesmos input_value/posições do padrão
// oficial do EmulatorJS, só sem os botões "Fast"/"Slow" que ele empilha em
// cima de Start/Select em todo core e que só poluíam a tela.
const VIRTUAL_GAMEPAD = {
  nes: [
    { type: "button", text: "B", id: "b", location: "right", right: 75, top: 70, bold: true, input_value: 0 },
    { type: "button", text: "A", id: "a", location: "right", right: 5, top: 70, bold: true, input_value: 8 },
    { type: "dpad", id: "dpad", location: "left", left: "50%", right: "50%", joystickInput: false, inputValues: [4, 5, 6, 7] },
    { type: "button", text: "Start", id: "start", location: "center", left: 60, fontSize: 15, block: true, input_value: 3 },
    { type: "button", text: "Select", id: "select", location: "center", left: -5, fontSize: 15, block: true, input_value: 2 },
  ],
  snes: [
    { type: "button", text: "X", id: "x", location: "right", left: 40, bold: true, input_value: 9 },
    { type: "button", text: "Y", id: "y", location: "right", top: 40, bold: true, input_value: 1 },
    { type: "button", text: "A", id: "a", location: "right", left: 81, top: 40, bold: true, input_value: 8 },
    { type: "button", text: "B", id: "b", location: "right", left: 40, top: 80, bold: true, input_value: 0 },
    { type: "dpad", id: "dpad", location: "left", left: "50%", top: "50%", joystickInput: false, inputValues: [4, 5, 6, 7] },
    { type: "button", text: "Start", id: "start", location: "center", left: 60, fontSize: 15, block: true, input_value: 3 },
    { type: "button", text: "Select", id: "select", location: "center", left: -5, fontSize: 15, block: true, input_value: 2 },
    { type: "button", text: "L", id: "l", location: "left", left: 3, top: -100, bold: true, block: true, input_value: 10 },
    { type: "button", text: "R", id: "r", location: "right", right: 3, top: -100, bold: true, block: true, input_value: 11 },
  ],
  gba: [
    { type: "button", text: "B", id: "b", location: "right", left: 10, top: 70, bold: true, input_value: 0 },
    { type: "button", text: "A", id: "a", location: "right", left: 81, top: 40, bold: true, input_value: 8 },
    { type: "dpad", id: "dpad", location: "left", left: "50%", top: "50%", joystickInput: false, inputValues: [4, 5, 6, 7] },
    { type: "button", text: "Start", id: "start", location: "center", left: 60, fontSize: 15, block: true, input_value: 3 },
    { type: "button", text: "Select", id: "select", location: "center", left: -5, fontSize: 15, block: true, input_value: 2 },
    { type: "button", text: "L", id: "l", location: "left", left: 3, top: -90, bold: true, block: true, input_value: 10 },
    { type: "button", text: "R", id: "r", location: "right", right: 3, top: -90, bold: true, block: true, input_value: 11 },
  ],
  segaMD: [
    { type: "button", text: "A", id: "a", location: "right", right: 145, top: 70, bold: true, input_value: 1 },
    { type: "button", text: "B", id: "b", location: "right", right: 75, top: 70, bold: true, input_value: 0 },
    { type: "button", text: "C", id: "c", location: "right", right: 5, top: 70, bold: true, input_value: 8 },
    { type: "dpad", id: "dpad", location: "left", left: "50%", right: "50%", joystickInput: false, inputValues: [4, 5, 6, 7] },
    { type: "button", text: "Start", id: "start", location: "center", left: 60, fontSize: 15, block: true, input_value: 3 },
  ],
};

// iOS não deixa esconder a barra do navegador numa aba comum — só quando a
// página abre a partir de um ícone salvo na Tela de Início. Essas tags é que
// habilitam esse modo standalone (e o botão de instalar no Android).
const PWA_HEAD = `
  <link rel="manifest" href="/manifest.webmanifest" />
  <meta name="theme-color" content="#08080d" />
  <meta name="mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
  <meta name="apple-mobile-web-app-title" content="Joga Retrô" />
  <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />`;

const SHARE_ICON_SVG =
  '<svg class="inline-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="M8 7l4-4 4 4"/><rect x="4" y="11" width="16" height="10" rx="2"/></svg>';

// Capas e ROMs são imutáveis (o nome do arquivo muda se o conteúdo mudar),
// então cache longo. HTML fica de fora pro catálogo nunca ficar velho.
app.use(
  express.static(path.join(__dirname, "public"), {
    setHeaders(res, filePath) {
      if (/[\\/](covers|roms|icons)[\\/]/.test(filePath)) {
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      } else if (/[\\/](css|js)[\\/]/.test(filePath)) {
        res.setHeader("Cache-Control", "public, max-age=3600");
      } else if (filePath.endsWith("sw.js")) {
        res.setHeader("Cache-Control", "no-cache");
      }
    },
  })
);

// ---------------------------------------------------------------------------
// GET / — vitrine
// ---------------------------------------------------------------------------
app.get("/", (req, res) => {
  const keychains = loadKeychains();
  const entries = Object.entries(keychains);

  const coresPresent = [...new Set(entries.map(([, cfg]) => cfg.core))];
  const chips = ["all", ...coresPresent]
    .map((core) => {
      const label = core === "all" ? "Todos" : (CORE_STYLE[core] || DEFAULT_CORE_STYLE).label;
      const isActive = core === "all";
      return `<button type="button" class="chip${isActive ? " chip--active" : ""}" data-filter="${escapeHtml(core)}" aria-pressed="${isActive}">${escapeHtml(label)}</button>`;
    })
    .join("\n");

  const carouselItems = entries
    .map(([keyId, cfg], i) => {
      const style = CORE_STYLE[cfg.core] || DEFAULT_CORE_STYLE;
      const genre = cfg.genre || "";
      const coreFile = CORE_FILE[cfg.core];
      const coreUrl = coreFile ? `${EJS_CDN_URL}cores/${coreFile}-wasm.data` : "";
      return `<button type="button" class="carousel-item"
        data-href="/play/${encodeURIComponent(keyId)}"
        data-core="${escapeHtml(cfg.core)}"
        data-title="${escapeHtml(cfg.title)}"
        data-genre="${escapeHtml(genre)}"
        data-tags="${escapeHtml((cfg.tags || []).join(" "))}"
        data-title-label="${escapeHtml(cfg.title)}"
        data-genre-label="${escapeHtml(genre)}"
        data-console-label="${escapeHtml(style.label)}"
        data-rom="${escapeHtml(cfg.gameUrl)}"
        data-core-url="${escapeHtml(coreUrl)}"
        style="--accent:${style.accent};--cover-from:${style.from};--cover-to:${style.to}"
        aria-label="${escapeHtml(cfg.title)}"
      ><img class="carousel-cover-img" src="/covers/${encodeURIComponent(cfg.cover)}" alt="" ${i < 4 ? 'fetchpriority="high"' : 'loading="lazy"'} draggable="false" /></button>`;
    })
    .join("\n");

  res.send(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>Joga Retrô</title>
  <meta name="description" content="Vitrine de jogos retro que rodam direto no navegador, com progresso salvo automaticamente." />
  <link rel="stylesheet" href="/css/style.css" />
  <link rel="preconnect" href="https://cdn.emulatorjs.org" crossorigin />
  <link rel="dns-prefetch" href="https://cdn.emulatorjs.org" />${PWA_HEAD}
</head>
<body class="index-body">
  <div class="theme-backdrop" id="theme-backdrop-a"></div>
  <div class="theme-backdrop" id="theme-backdrop-b"></div>

  <main class="app-shell">
    <header class="topbar">
      <h1 class="brand"><span class="brand-mark" aria-hidden="true">🕹️</span> <span class="brand-text">Joga Retrô</span></h1>
      <button type="button" class="install-btn" id="install-btn" hidden>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="M7 12l5 5 5-5"/><path d="M4 21h16"/></svg>
        Instalar
      </button>
    </header>

    <div class="library-controls">
      <div class="search-row">
        <div class="search-box">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
          <input type="search" id="search-input" placeholder="Busque por tema: guerra, espaço..." autocomplete="off" enterkeyhint="go" aria-label="Buscar jogo por nome, gênero ou tema" />
        </div>
        <button type="button" class="ai-pick" id="ai-pick" aria-label="Sugerir um jogo pra mim" title="Sugerir um jogo pra mim">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9z"/><path d="M18 15l.9 2.1L21 18l-2.1.9L18 21l-.9-2.1L15 18l2.1-.9z"/></svg>
        </button>
      </div>
      <div class="chip-row" id="chip-row">
        ${chips}
      </div>
    </div>

    <div class="carousel-wrap">
      <button type="button" class="carousel-nav" id="carousel-prev" aria-label="Jogo anterior">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>
      </button>
      <div class="carousel" id="carousel" tabindex="0" role="listbox" aria-label="Biblioteca de jogos">
        <div class="carousel-track" id="carousel-track">
          ${carouselItems}
        </div>
      </div>
      <button type="button" class="carousel-nav" id="carousel-next" aria-label="Próximo jogo">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>
      </button>
    </div>

    <p id="empty-state" class="empty-state" hidden>Nenhum jogo encontrado. Tenta outro termo ou filtro.</p>

    <div class="now-playing" id="now-playing">
      <div class="now-playing-tags">
        <span class="card-console-tag" id="now-playing-console"></span>
        <span class="card-genre-tag" id="now-playing-genre"></span>
      </div>
      <div class="now-playing-title" id="now-playing-title"></div>
      <div class="now-playing-reason" id="now-playing-reason" hidden></div>
      <span class="carousel-counter" id="carousel-counter"></span>
      <a class="play-btn" id="now-playing-link" href="#">
        Jogar agora
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>
      </a>
    </div>
  </main>

  <div class="sheet" id="ios-sheet" hidden>
    <div class="sheet-card" role="dialog" aria-modal="true" aria-labelledby="ios-sheet-title">
      <h2 id="ios-sheet-title">📲 Instalar no iPhone</h2>
      <p>
        O iOS não deixa nenhum site se instalar sozinho — a Apple exige que você
        confirme. Toque em <strong>Compartilhar</strong> ${SHARE_ICON_SVG} na barra do
        navegador e escolha <strong>Adicionar à Tela de Início</strong>. Depois abra
        sempre por esse ícone: roda em tela cheia, sem barra nenhuma.
      </p>
      <button type="button" class="sheet-close" id="ios-sheet-close">Entendi</button>
    </div>
  </div>

  <script src="/js/library.js" defer></script>
</body>
</html>`);
});

// ---------------------------------------------------------------------------
// GET /api/keychains — catálogo em JSON (debug/integração)
// ---------------------------------------------------------------------------
app.get("/api/keychains", (req, res) => {
  res.json(loadKeychains());
});

// ---------------------------------------------------------------------------
// GET /play/:keyId — player
// ---------------------------------------------------------------------------
app.get("/play/:keyId", (req, res) => {
  const { keyId } = req.params;
  const keychains = loadKeychains();
  const cfg = keychains[keyId];

  if (!cfg) {
    const known = Object.keys(keychains)
      .map((k) => `<li><a href="/play/${encodeURIComponent(k)}">${escapeHtml(k)}</a></li>`)
      .join("");
    res.status(404).send(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Jogo não encontrado</title>
  <link rel="stylesheet" href="/css/style.css" />${PWA_HEAD}
</head>
<body>
  <main class="simple-wrap">
    <h1>Jogo "${escapeHtml(keyId)}" não encontrado</h1>
    <p class="subtitle">IDs cadastrados em config/keychains.json:</p>
    <ul class="known-list">${known}</ul>
    <p><a href="/">&larr; voltar pra vitrine</a></p>
  </main>
</body>
</html>`);
    return;
  }

  const playConfig = {
    id: keyId,
    core: cfg.core,
    title: cfg.title,
    gameUrl: cfg.gameUrl,
    cdn: EJS_CDN_URL,
    gamepad: VIRTUAL_GAMEPAD[cfg.core] || null,
    skipIntro: cfg.skipIntro !== false,
  };

  res.send(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no" />
  <title>${escapeHtml(cfg.title)}</title>
  <link rel="stylesheet" href="/css/style.css" />
  <link rel="preconnect" href="https://cdn.emulatorjs.org" crossorigin />
  <link rel="preload" as="fetch" href="${escapeHtml(cfg.gameUrl)}" crossorigin />${PWA_HEAD}
</head>
<body class="player-body">
  <div id="load-badge" class="load-badge" hidden></div>
  <a href="/" class="back-btn" aria-label="Voltar pra vitrine">&larr;</a>
  <div id="game" class="game-container"></div>

  <div id="play-gate" class="play-gate">
    <div class="play-gate-inner">
      <img class="play-gate-cover" src="/covers/${encodeURIComponent(cfg.cover)}" alt="" />
      <button type="button" id="play-gate-btn" class="play-gate-btn" aria-label="Jogar">▶</button>
      <div class="play-gate-title">${escapeHtml(cfg.title)}</div>
      <div id="play-gate-hint" class="play-gate-hint">Toque para jogar</div>
      <div id="play-gate-progress" class="play-gate-progress" hidden></div>
    </div>
  </div>

  <div id="rotate-hint" class="rotate-hint">🔄 Gire o celular pra jogar em paisagem</div>

  <script>window.__PLAY__ = ${jsonForScript(playConfig)};</script>
  <script src="/js/player.js"></script>
  <script src="${EJS_CDN_URL}loader.js"></script>
</body>
</html>`);
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Joga Retrô rodando em http://localhost:${PORT}`);
  });
}

module.exports = app;
