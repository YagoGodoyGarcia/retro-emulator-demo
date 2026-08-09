require("dotenv").config();

const express = require("express");
const path = require("path");
const multer = require("multer");
const QRCode = require("qrcode");
const keychainsConfig = require("./config/keychains.json");
const store = require("./lib/store");
const access = require("./lib/access");
const libraryStore = require("./lib/library-store");
const blob = require("./lib/blob");
const gameEntry = require("./lib/game-entry");

const app = express();
const PORT = process.env.PORT || 3000;

// CDN pública do EmulatorJS. Pode ser trocada via env sem mexer em código.
const EJS_CDN_URL = process.env.EMULATORJS_CDN_URL || "https://cdn.emulatorjs.org/stable/data/";

// Qual arquivo de core o EmulatorJS baixa pra cada sistema (da lista oficial
// dele, data/src/consts.js — ele usa o primeiro core de cada sistema). Serve
// só pro pré-aquecimento na vitrine.
const CORE_FILE = {
  nes: "fceumm",
  snes: "snes9x",
  gba: "mgba",
  segaMD: "genesis_plus_gx",
};

// O catálogo estático (config/keychains.json, versionado no repo) mais o que
// o admin subiu depois (lib/library-store.js — dinâmico, porque escrever no
// JSON em produção não é possível: filesystem só-leitura na Vercel).
async function loadKeychains() {
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

  let uploaded = [];
  try {
    uploaded = await libraryStore.list();
  } catch (err) {
    console.error("[library] falha ao listar jogos do admin:", err.message);
  }
  for (const cfg of uploaded) keychains[cfg.gameId] = cfg;

  return keychains;
}

// cover pode ser um nome de arquivo local ("jogo.png", vira /covers/jogo.png)
// ou uma URL completa (Vercel Blob, upload do admin em produção) — essa é
// usada como está.
function coverSrc(cfg) {
  return /^https?:\/\//.test(cfg.cover) ? cfg.cover : `/covers/${encodeURIComponent(cfg.cover)}`;
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

// JSON dentro de <script>: além do escape normal, quebra qualquer "</script>"
// que apareça num valor, senão a tag fecha no meio.
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

const VIRTUAL_GAMEPAD = require("./lib/gamepad");

const PWA_HEAD = `
  <link rel="manifest" href="/manifest.webmanifest" />
  <meta name="theme-color" content="#05050a" />
  <meta name="mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
  <meta name="apple-mobile-web-app-title" content="MYDE" />
  <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />`;

const SHARE_ICON_SVG =
  '<svg class="inline-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="M8 7l4-4 4 4"/><rect x="4" y="11" width="16" height="10" rx="2"/></svg>';

app.use(express.json({ limit: "16kb" }));

// Os headers de cache que valem em produção estão no vercel.json — lá a
// Vercel serve public/ direto pelo CDN e este middleware nem roda. Isto aqui
// é pro `npm start` local se comportar igual.
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
// telas de sistema
// ---------------------------------------------------------------------------

function systemPage(res, status, { icon, title, body }) {
  res.status(status).send(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>MYDE</title>
  <link rel="stylesheet" href="/css/style.css" />${PWA_HEAD}
</head>
<body class="system-body">
  <main class="system-card">
    <div class="system-mark">MYDE</div>
    <div class="system-icon">${icon}</div>
    <h1>${title}</h1>
    ${body}
  </main>
</body>
</html>`);
}

// ---------------------------------------------------------------------------
// /t/:token — resgate do link exclusivo
// ---------------------------------------------------------------------------

app.get("/t/:token", async (req, res) => {
  const device = access.deviceId(req, res);
  let result;
  try {
    result = await access.claim(store, req.params.token, device);
  } catch (err) {
    console.error("[access] falha ao resgatar token:", err.message);
    return systemPage(res, 503, {
      icon: "⚠️",
      title: "Não deu pra validar seu link",
      body: "<p>Tenta de novo em alguns segundos.</p>",
    });
  }

  if (result.status === access.CLAIM.OK) {
    access.startSession(res, result.token.id);
    return res.redirect(302, "/");
  }
  if (result.status === access.CLAIM.IN_USE) {
    return systemPage(res, 403, {
      icon: "🔒",
      title: "Este link já está em uso",
      body:
        "<p>Cada link do MYDE vale pra um aparelho só, e este já foi ativado em outro.</p>" +
        "<p>Se o aparelho é seu e você trocou de celular ou limpou o navegador, peça pra liberarem o link de novo.</p>",
    });
  }
  if (result.status === access.CLAIM.REVOKED) {
    return systemPage(res, 403, {
      icon: "⛔",
      title: "Link desativado",
      body: "<p>Este acesso foi encerrado. Peça um link novo.</p>",
    });
  }
  return systemPage(res, 404, {
    icon: "❓",
    title: "Link inválido",
    body: "<p>Confere se o endereço veio completo, ou leia o QR de novo.</p>",
  });
});

// Portão das páginas. Em ACCESS_MODE=open não bloqueia nada.
async function requireAccess(req, res, next) {
  let session;
  try {
    session = await access.currentSession(store, req, res);
  } catch (err) {
    console.error("[access] falha ao checar sessão:", err.message);
    return systemPage(res, 503, {
      icon: "⚠️",
      title: "Não deu pra validar seu acesso",
      body: "<p>Tenta de novo em alguns segundos.</p>",
    });
  }

  if (session.allowed) {
    req.mydeSession = session;
    return next();
  }

  const body =
    session.reason === "revoked"
      ? "<p>Este acesso foi encerrado. Peça um link novo.</p>"
      : session.reason === "wrong_device"
      ? "<p>Seu link está ativado em outro aparelho.</p>"
      : "<p>O MYDE é liberado por convite. Use o link ou o QR que você recebeu.</p>";

  return systemPage(res, 403, { icon: "🎟️", title: "Acesso por convite", body });
}

// ---------------------------------------------------------------------------
// GET / — a vitrine
// ---------------------------------------------------------------------------

app.get("/", requireAccess, async (req, res) => {
  const keychains = await loadKeychains();
  // Os destaques abrem a vitrine — é o primeiro card que o usuário vê ao
  // chegar. O resto mantém a ordem do config.
  const entries = Object.entries(keychains).sort(
    ([, a], [, b]) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0)
  );

  const coresPresent = [...new Set(entries.map(([, cfg]) => cfg.core))];
  const chips = ["all", ...coresPresent]
    .map((core) => {
      const label = core === "all" ? "Todos" : (CORE_STYLE[core] || DEFAULT_CORE_STYLE).label;
      const isActive = core === "all";
      return `<button type="button" class="chip${isActive ? " chip--active" : ""}" data-filter="${escapeHtml(core)}" aria-pressed="${isActive}">${escapeHtml(label)}</button>`;
    })
    .join("\n");

  const tiles = entries
    .map(([keyId, cfg], i) => {
      const style = CORE_STYLE[cfg.core] || DEFAULT_CORE_STYLE;
      const genre = cfg.genre || "";
      const coreFile = CORE_FILE[cfg.core];
      const coreUrl = coreFile ? `${EJS_CDN_URL}cores/${coreFile}-wasm.data` : "";
      const badge = cfg.featured
        ? '<span class="tile-badge">Exclusivo MYDE</span>'
        : "";
      return `<button type="button" class="tile${cfg.featured ? " tile--featured" : ""}"
        data-href="/play/${encodeURIComponent(keyId)}"
        data-featured="${cfg.featured ? "1" : ""}"
        data-core="${escapeHtml(cfg.core)}"
        data-title="${escapeHtml(cfg.title)}"
        data-genre="${escapeHtml(genre)}"
        data-tags="${escapeHtml((cfg.tags || []).join(" "))}"
        data-title-label="${escapeHtml(cfg.title)}"
        data-genre-label="${escapeHtml(genre)}"
        data-console-label="${escapeHtml(style.label)}"
        data-rom="${escapeHtml(cfg.gameUrl)}"
        data-core-url="${escapeHtml(coreUrl)}"
        style="--accent:${style.accent};--art:url('${escapeHtml(coverSrc(cfg))}')"
        aria-label="${escapeHtml(cfg.title)}"
      ><img class="tile-img" src="${escapeHtml(coverSrc(cfg))}" alt="" ${i < 3 ? 'fetchpriority="high"' : 'loading="lazy"'} draggable="false" />${badge}</button>`;
    })
    .join("\n");

  res.send(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>MYDE</title>
  <meta name="description" content="Console retro que roda direto no navegador." />
  <link rel="stylesheet" href="/css/style.css" />
  <link rel="preconnect" href="https://cdn.emulatorjs.org" crossorigin />
  <link rel="dns-prefetch" href="https://cdn.emulatorjs.org" />${PWA_HEAD}
</head>
<body class="index-body">
  <div class="art-backdrop" id="art-a"></div>
  <div class="art-backdrop" id="art-b"></div>
  <div class="screen-veil"></div>

  <main class="app-shell">
    <header class="topbar">
      <h1 class="brand">MYDE</h1>
      <div class="topbar-actions">
        <button type="button" class="icon-btn" id="search-toggle" aria-label="Buscar" aria-expanded="false">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
        </button>
        <button type="button" class="icon-btn" id="grid-toggle" aria-label="Ver todos os jogos" aria-expanded="false">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.6"/><rect x="14" y="3" width="7" height="7" rx="1.6"/><rect x="3" y="14" width="7" height="7" rx="1.6"/><rect x="14" y="14" width="7" height="7" rx="1.6"/></svg>
        </button>
        <button type="button" class="icon-btn" id="pick" aria-label="Sugerir um jogo pra mim">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9z"/><path d="M18 15l.9 2.1L21 18l-2.1.9L18 21l-.9-2.1L15 18l2.1-.9z"/></svg>
        </button>
        <button type="button" class="icon-btn" id="install" aria-label="Instalar o app" hidden>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="M7 12l5 5 5-5"/><path d="M4 21h16"/></svg>
        </button>
      </div>
    </header>

    <div class="search-panel" id="search-panel">
      <div class="search-box">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
        <input type="search" id="search-input" placeholder="Busque por tema: guerra, espaço..." autocomplete="off" enterkeyhint="go" aria-label="Buscar jogo por nome, gênero ou tema" />
      </div>
      <div class="chip-row">
        ${chips}
      </div>
    </div>

    <div class="stage" id="stage" tabindex="0" role="listbox" aria-label="Biblioteca de jogos">
      <button type="button" class="stage-nav" id="nav-prev" aria-label="Jogo anterior">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>
      </button>
      <div class="rail" id="rail">
        ${tiles}
      </div>
      <button type="button" class="stage-nav" id="nav-next" aria-label="Próximo jogo">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>
      </button>
    </div>

    <p id="empty-state" class="empty-state" hidden>Nenhum jogo encontrado.</p>

    <div class="hud" id="hud">
      <div class="hud-meta">
        <span class="hud-exclusive" id="hud-exclusive" hidden>Exclusivo</span>
        <span id="hud-console"></span>
        <span id="hud-genre"></span>
      </div>
      <div class="hud-title" id="hud-title"></div>
      <div class="hud-note" id="hud-note" hidden></div>
      <a class="launch-btn" id="launch" href="#">
        Jogar
        <svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M8 5l11 7-11 7z"/></svg>
      </a>
    </div>
  </main>

  <div class="library-sheet" id="library-sheet" hidden>
    <header class="library-head">
      <div class="library-search">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
        <input type="search" id="library-search-input" placeholder="Filtrar por nome, gênero ou tema" autocomplete="off" aria-label="Filtrar a lista de jogos" />
      </div>
      <button type="button" class="icon-btn" id="library-close" aria-label="Fechar a lista">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
      </button>
    </header>
    <div class="library-count" id="library-count"></div>
    <div class="library-scroll" id="library-scroll"></div>
  </div>

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

  <script>window.__SESSION__ = ${req.mydeSession && req.mydeSession.token ? "true" : "false"};</script>
  <script src="/js/library.js" defer></script>
</body>
</html>`);
});

// Sinal de vida: marca o link como "em uso agora" no painel de admin.
app.post("/api/heartbeat", async (req, res) => {
  const tokenId = access.sessionTokenId(req);
  if (!tokenId) return res.json({ ok: false });
  try {
    await access.touch(store, tokenId);
  } catch (err) {
    return res.json({ ok: false });
  }
  res.json({ ok: true });
});

app.get("/api/keychains", async (req, res) => {
  res.json(await loadKeychains());
});

// ---------------------------------------------------------------------------
// GET /play/:id — o player
// ---------------------------------------------------------------------------

app.get("/play/:keyId", requireAccess, async (req, res) => {
  const { keyId } = req.params;
  const keychains = await loadKeychains();
  const cfg = keychains[keyId];

  if (!cfg) {
    const known = Object.keys(keychains)
      .map((k) => `<li><a href="/play/${encodeURIComponent(k)}">${escapeHtml(k)}</a></li>`)
      .join("");
    return systemPage(res, 404, {
      icon: "🕹️",
      title: `Jogo "${escapeHtml(keyId)}" não existe`,
      body: `<ul class="system-list">${known}</ul><p><a href="/">&larr; voltar</a></p>`,
    });
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
  <title>${escapeHtml(cfg.title)} · MYDE</title>
  <link rel="stylesheet" href="/css/style.css" />
  <link rel="preconnect" href="https://cdn.emulatorjs.org" crossorigin />
  <link rel="preload" as="fetch" href="${escapeHtml(cfg.gameUrl)}" crossorigin />${PWA_HEAD}
</head>
<body class="player-body">
  <div id="load-badge" class="load-badge" hidden></div>
  <a href="/" class="back-btn" aria-label="Voltar pra biblioteca">&larr;</a>
  <div id="game" class="game-container"></div>

  <div id="play-gate" class="play-gate">
    <div class="play-gate-inner">
      <img class="play-gate-cover" src="${escapeHtml(coverSrc(cfg))}" alt="" />
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

// ---------------------------------------------------------------------------
// ADMIN
// ---------------------------------------------------------------------------

function adminLoginPage(res, error) {
  res.status(error ? 401 : 200).send(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>MYDE · admin</title>
  <link rel="stylesheet" href="/css/style.css" />
  <meta name="robots" content="noindex" />
</head>
<body class="admin-body">
  <form class="login-wrap" method="POST" action="/admin/login">
    <h1>MYDE ADMIN</h1>
    <input class="field" type="password" name="password" placeholder="Senha" autocomplete="current-password" autofocus required />
    <button class="btn" type="submit">Entrar</button>
    ${error ? `<p class="login-error">${escapeHtml(error)}</p>` : ""}
  </form>
</body>
</html>`);
}

function adminSetupPage(res) {
  systemPage(res, 503, {
    icon: "🔧",
    title: "Admin não configurado",
    body:
      "<p>Defina a variável de ambiente <code>ADMIN_PASSWORD</code> e publique de novo pra liberar este painel.</p>" +
      "<p>Sem senha, qualquer pessoa poderia gerar links de acesso — por isso ele não abre sozinho.</p>",
  });
}

app.get("/admin", (req, res) => {
  if (!access.adminConfigured) return adminSetupPage(res);
  if (!access.isAdmin(req)) return adminLoginPage(res);

  const warnings = [];
  if (!store.durable) {
    warnings.push(
      '<div class="banner banner--warn"><strong>Armazenamento em memória.</strong> ' +
        "Os links somem quando o servidor reinicia — e na Vercel isso acontece o tempo todo, " +
        "então o vínculo com o aparelho não é confiável neste modo. Conecte um banco Redis " +
        "(Vercel KV ou Upstash) e defina <code>KV_REST_API_URL</code> + <code>KV_REST_API_TOKEN</code>.</div>"
    );
  }
  if (access.ACCESS_MODE !== "locked") {
    warnings.push(
      '<div class="banner banner--info"><strong>Acesso aberto.</strong> ' +
        "Qualquer pessoa entra sem link. Os links abaixo já funcionam, mas só passam a ser " +
        "obrigatórios com <code>ACCESS_MODE=locked</code>.</div>"
    );
  }
  if (!access.secretFromEnv) {
    warnings.push(
      '<div class="banner banner--warn"><strong>Sem <code>ACCESS_SECRET</code>.</strong> ' +
        "O segredo que assina os cookies é sorteado a cada inicialização, então todo mundo " +
        "perde a sessão a cada deploy. Defina um valor fixo e longo.</div>"
    );
  }
  if (!blob.canUpload) {
    warnings.push(
      '<div class="banner banner--warn"><strong>Upload de ROM desligado.</strong> ' +
        "Na Vercel o disco é só leitura — sem um lugar durável pra guardar o arquivo, subir um " +
        "jogo aqui e ele sumir no próximo deploy seria pior que não ter a função. Ative o " +
        "<strong>Vercel Blob</strong> (aba Storage do projeto → Create Database → Blob) — a " +
        "variável <code>BLOB_READ_WRITE_TOKEN</code> é adicionada sozinha.</div>"
    );
  }

  res.send(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>MYDE · admin</title>
  <link rel="stylesheet" href="/css/style.css" />
  <meta name="robots" content="noindex" />
</head>
<body class="admin-body">
  <div class="admin-wrap">
    <div class="admin-head">
      <h1>MYDE ADMIN</h1>
      <a href="/admin/logout">sair</a>
    </div>

    ${warnings.join("\n")}

    <div class="panel">
      <h2>Gerar link de acesso</h2>
      <form class="field-row" id="create-form">
        <input class="field" id="label" type="text" placeholder="Pra quem é? (ex: João, mesa 4, feira)" maxlength="60" />
        <button class="btn" id="create-btn" type="submit">Gerar</button>
      </form>
    </div>

    <div class="token-list" id="token-list"></div>

    <div class="panel">
      <h2>Adicionar jogo</h2>
      <p class="panel-note">
        ROM até ${(gameEntry.MAX_ROM_BYTES / 1024 / 1024).toFixed(1)}MB
        (${gameEntry.CORES.join(", ")}) + capa até ${(gameEntry.MAX_COVER_BYTES / 1024 / 1024).toFixed(1)}MB.
        Sem ROM comercial: o repositório e este deploy são públicos, então qualquer
        upload aqui vira distribuição pública na hora — homebrew, domínio público ou
        algo que você mesmo tem o direito de redistribuir.
      </p>
      <form id="game-form" ${blob.canUpload ? "" : "aria-disabled=\"true\""}>
        <div class="field-row">
          <input class="field" id="game-title" name="title" type="text" placeholder="Título" maxlength="60" required ${blob.canUpload ? "" : "disabled"} />
          <input class="field" id="game-genre" name="genre" type="text" placeholder="Gênero (ex: Plataforma)" maxlength="40" ${blob.canUpload ? "" : "disabled"} />
        </div>
        <div class="field-row">
          <select class="field" id="game-core" name="core" required ${blob.canUpload ? "" : "disabled"}>
            <option value="" disabled selected>Console</option>
            ${gameEntry.CORES.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml((CORE_STYLE[c] || DEFAULT_CORE_STYLE).label)}</option>`).join("")}
          </select>
          <input class="field" id="game-tags" name="tags" type="text" placeholder="Temas, separados por vírgula (ex: espaço, guerra)" ${blob.canUpload ? "" : "disabled"} />
        </div>
        <div class="field-row">
          <label class="file-field">
            <span>Arquivo da ROM</span>
            <input type="file" id="game-rom" name="rom" required ${blob.canUpload ? "" : "disabled"} />
          </label>
          <label class="file-field">
            <span>Capa (imagem)</span>
            <input type="file" id="game-cover" name="cover" accept="image/*" required ${blob.canUpload ? "" : "disabled"} />
          </label>
        </div>
        <label class="check-row">
          <input type="checkbox" id="game-rights" name="confirmRights" required ${blob.canUpload ? "" : "disabled"} />
          <span>Confirmo que tenho o direito de distribuir esse arquivo publicamente (é homebrew, domínio público, ou eu possuo os direitos de redistribuição para este uso).</span>
        </label>
        <button class="btn" id="game-submit" type="submit" ${blob.canUpload ? "" : "disabled"}>Adicionar à biblioteca</button>
        <p class="form-error" id="game-error" hidden></p>
      </form>
    </div>

    <div class="game-list" id="game-list"></div>
  </div>
  <script src="/js/admin.js" defer></script>
</body>
</html>`);
});

app.post("/admin/login", express.urlencoded({ extended: false }), (req, res) => {
  if (!access.adminConfigured) return adminSetupPage(res);
  if (!access.checkAdminPassword(req.body.password)) {
    return adminLoginPage(res, "Senha incorreta.");
  }
  access.loginAdmin(res);
  res.redirect(302, "/admin");
});

app.get("/admin/logout", (req, res) => {
  access.logoutAdmin(res);
  res.redirect(302, "/admin");
});

function requireAdmin(req, res, next) {
  if (!access.isAdmin(req)) return res.status(401).json({ error: "não autorizado" });
  next();
}

function publicOrigin(req) {
  const proto = req.headers["x-forwarded-proto"] || req.protocol || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  return `${proto}://${host}`;
}

app.get("/admin/api/tokens", requireAdmin, async (req, res) => {
  try {
    const origin = publicOrigin(req);
    const rows = await store.list();
    rows.sort((a, b) => b.createdAt - a.createdAt);
    const tokens = await Promise.all(
      rows.map(async (t) => {
        const url = `${origin}/t/${t.id}`;
        return {
          ...t,
          url,
          online: access.isOnline(t),
          qr: await QRCode.toDataURL(url, { margin: 1, width: 220 }),
        };
      })
    );
    res.json({ tokens, durable: store.durable, mode: access.ACCESS_MODE });
  } catch (err) {
    console.error("[admin] falha ao listar tokens:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post("/admin/api/tokens", requireAdmin, async (req, res) => {
  try {
    const token = access.newToken(String(req.body.label || "").slice(0, 60));
    await store.put(token);
    res.json({ token });
  } catch (err) {
    console.error("[admin] falha ao criar token:", err.message);
    res.status(500).json({ error: err.message });
  }
});

async function mutate(req, res, fn) {
  try {
    const token = await store.get(req.params.id);
    if (!token) return res.status(404).json({ error: "não encontrado" });
    fn(token);
    await store.put(token);
    res.json({ token });
  } catch (err) {
    console.error("[admin] falha ao atualizar token:", err.message);
    res.status(500).json({ error: err.message });
  }
}

app.post("/admin/api/tokens/:id/revoke", requireAdmin, (req, res) =>
  mutate(req, res, (t) => { t.revoked = true; })
);

app.post("/admin/api/tokens/:id/unrevoke", requireAdmin, (req, res) =>
  mutate(req, res, (t) => { t.revoked = false; })
);

// Solta o aparelho: o próximo que abrir o link fica com ele. É a saída pra
// quem trocou de celular ou limpou os dados do navegador.
app.post("/admin/api/tokens/:id/reset", requireAdmin, (req, res) =>
  mutate(req, res, (t) => {
    t.boundDevice = null;
    t.boundAt = null;
    t.lastSeen = null;
  })
);

app.delete("/admin/api/tokens/:id", requireAdmin, async (req, res) => {
  try {
    await store.remove(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    console.error("[admin] falha ao apagar token:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// ADMIN — upload de jogo
// ---------------------------------------------------------------------------

// Em memória (não no disco): o destino final é o Blob ou, em dev local, o
// filesystem — nenhum dos dois precisa de um arquivo temporário no meio.
// O limite aqui é só uma rede de segurança grosseira contra requisição gigante
// consumir memória à toa; a validação fina (tamanho por tipo, extensão por
// core) é o game-entry.js, depois que o arquivo já está em mãos.
const uploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: Math.max(gameEntry.MAX_ROM_BYTES, gameEntry.MAX_COVER_BYTES) + 64 * 1024 },
});

app.get("/admin/api/games", requireAdmin, async (req, res) => {
  try {
    const games = await libraryStore.list();
    games.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
    res.json({ games, canUpload: blob.canUpload });
  } catch (err) {
    console.error("[admin] falha ao listar jogos:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post(
  "/admin/api/games",
  requireAdmin,
  uploadMiddleware.fields([
    { name: "rom", maxCount: 1 },
    { name: "cover", maxCount: 1 },
  ]),
  async (req, res) => {
    if (!blob.canUpload) {
      return res.status(503).json({
        error: "Upload desligado neste ambiente — configure o Vercel Blob (aviso no topo do painel).",
      });
    }
    try {
      const files = {
        rom: req.files && req.files.rom && req.files.rom[0],
        cover: req.files && req.files.cover && req.files.cover[0],
      };

      // Todo id em uso, estático ou já subido antes, pra não colidir.
      const staticIds = new Set(Object.keys(keychainsConfig).filter((k) => k !== "_comment"));
      const uploadedGames = await libraryStore.list();
      uploadedGames.forEach((g) => staticIds.add(g.gameId));

      const { romFilename, coverFilename, entry } = gameEntry.buildGameEntry(req.body, files, staticIds);

      const gameUrl = await blob.upload("roms", romFilename, files.rom.buffer, files.rom.mimetype);
      const cover = await blob.upload("covers", coverFilename, files.cover.buffer, files.cover.mimetype);

      const game = { ...entry, gameUrl, cover, romFilename, coverFilename, addedAt: Date.now() };
      await libraryStore.put(game);
      res.json({ game });
    } catch (err) {
      if (err instanceof gameEntry.ValidationError) {
        return res.status(400).json({ error: err.message });
      }
      console.error("[admin] falha ao adicionar jogo:", err.message);
      res.status(500).json({ error: "Falha ao salvar o jogo. Tenta de novo." });
    }
  }
);

app.delete("/admin/api/games/:id", requireAdmin, async (req, res) => {
  try {
    const game = await libraryStore.get(req.params.id);
    if (!game) return res.status(404).json({ error: "não encontrado" });
    await blob.remove("roms", game.romFilename, game.gameUrl);
    await blob.remove("covers", game.coverFilename, game.cover);
    await libraryStore.remove(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    console.error("[admin] falha ao apagar jogo:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------

app.use((req, res) => {
  systemPage(res, 404, {
    icon: "🛰️",
    title: "Página não encontrada",
    body: '<p><a href="/">Voltar pra biblioteca</a></p>',
  });
});

// Erro do multer (arquivo maior que o limite, campo inesperado) não passa
// pelo try/catch da rota — cai direto aqui. Sem isso o Express devolveria a
// página de erro HTML padrão dele pra uma chamada que o admin.js espera
// como JSON.
app.use((err, req, res, next) => {
  if (err && err.name === "MulterError") {
    const message =
      err.code === "LIMIT_FILE_SIZE"
        ? "Arquivo maior que o limite. Veja o tamanho máximo no painel."
        : `Falha no upload: ${err.message}`;
    return res.status(400).json({ error: message });
  }
  console.error("[server] erro não tratado:", err);
  res.status(500).json({ error: "Erro interno." });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`MYDE rodando em http://localhost:${PORT}`);
    console.log(`  acesso: ${access.ACCESS_MODE} | tokens: ${store.durable ? "redis" : "memória"} | admin: ${access.adminConfigured ? "on" : "sem ADMIN_PASSWORD"}`);
    console.log(`  upload de jogo: ${blob.durable ? "vercel blob" : blob.canUpload ? "disco local (dev)" : "desligado (sem BLOB_READ_WRITE_TOKEN na Vercel)"}`);
  });
}

module.exports = app;
