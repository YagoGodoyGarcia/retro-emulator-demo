require("dotenv").config();

const express = require("express");
const path = require("path");
const multer = require("multer");
const QRCode = require("qrcode");
const store = require("./lib/store");
const access = require("./lib/access");
const libraryStore = require("./lib/library-store");
const blob = require("./lib/blob");
const gameEntry = require("./lib/game-entry");
const library = require("./lib/library-service");
const platforms = require("./lib/platforms");
const romHashLib = require("./lib/rom-hash");
const blobUploadPolicy = require("./lib/blob-upload-policy");
const libraryScan = require("./lib/library-scan");
const playStats = require("./lib/play-stats");
const { handleUpload: handleBlobUpload } = require("@vercel/blob/client");

const app = express();
const PORT = process.env.PORT || 3000;

// CDN pública do EmulatorJS. Pode ser trocada via env sem mexer em código.
const EJS_CDN_URL = process.env.EMULATORJS_CDN_URL || "https://cdn.emulatorjs.org/stable/data/";

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
  const allGames = await library.getPublishedGames();
  const plays = await playStats.getCounts(allGames.map((g) => g.gameId));
  // Destaque continua abrindo a vitrine primeiro — é um slot editorial, não
  // uma métrica. Dentro de cada grupo (destaque / resto), ordena por
  // jogadas: quem foi mais escolhido pelas pessoas sobe.
  const entries = allGames
    .slice()
    .sort((a, b) => {
      const featuredDiff = (b.featured ? 1 : 0) - (a.featured ? 1 : 0);
      if (featuredDiff) return featuredDiff;
      return (plays[b.gameId] || 0) - (plays[a.gameId] || 0);
    });

  const coresPresent = [...new Set(entries.map((cfg) => cfg.core))];
  const chips = ["all", ...coresPresent]
    .map((core) => {
      const label = core === "all" ? "Todos" : platforms.styleOf(core).label;
      const isActive = core === "all";
      return `<button type="button" class="chip${isActive ? " chip--active" : ""}" data-filter="${escapeHtml(core)}" aria-pressed="${isActive}">${escapeHtml(label)}</button>`;
    })
    .join("\n");

  const tiles = entries
    .map((cfg, i) => {
      const style = platforms.styleOf(cfg.core);
      const genre = cfg.genre || "";
      const coreFile = platforms.coreFileOf(cfg.core);
      const coreUrl = coreFile ? `${EJS_CDN_URL}cores/${coreFile}-wasm.data` : "";
      const badge = cfg.featured
        ? '<span class="tile-badge">Exclusivo MYDE</span>'
        : "";
      return `<button type="button" class="tile${cfg.featured ? " tile--featured" : ""}"
        data-href="/play/${encodeURIComponent(cfg.gameId)}"
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

  <script>
    window.__SESSION__ = ${req.mydeSession && req.mydeSession.token ? "true" : "false"};
    // Ordem central de plataformas (lib/platforms.js) pra agrupar a folha
    // "ver todos os jogos" sem depender da ordem em que os jogos foram
    // cadastrados (seção 30 do briefing).
    window.__PLATFORM_ORDER__ = ${jsonForScript(platforms.list().map((p) => p.label))};
  </script>
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
  const games = await library.getPublishedGames();
  res.json(Object.fromEntries(games.map((g) => [g.gameId, g])));
});

// ---------------------------------------------------------------------------
// GET /play/:id — o player
// ---------------------------------------------------------------------------

app.get("/play/:keyId", requireAccess, async (req, res) => {
  const { keyId } = req.params;
  // Só jogo publicado — um jogo importado em lote e ainda sem revisão
  // (status "review") não deve ficar jogável por quem adivinhar/guardar a
  // URL antes de alguém confirmar que está pronto.
  const games = await library.getPublishedGames();
  const cfg = games.find((g) => g.gameId === keyId);

  if (!cfg) {
    const known = games
      .map((g) => `<li><a href="/play/${encodeURIComponent(g.gameId)}">${escapeHtml(g.gameId)}</a></li>`)
      .join("");
    return systemPage(res, 404, {
      icon: "🕹️",
      title: `Jogo "${escapeHtml(keyId)}" não existe`,
      body: `<ul class="system-list">${known}</ul><p><a href="/">&larr; voltar</a></p>`,
    });
  }

  // Não bloqueia o carregamento da página por causa disso — é só contagem
  // pra ordenar a home por popularidade depois.
  playStats.increment(keyId).catch(() => {});

  const playConfig = {
    id: keyId,
    core: cfg.core,
    title: cfg.title,
    gameUrl: cfg.gameUrl,
    cdn: EJS_CDN_URL,
    // `gamepad` no keychains.json escolhe uma variante de controle (ex.
    // "segaMD6" pra jogo de luta que usa os 6 botões) sem mexer em código —
    // mesma ideia do GAMEURL_ por variável de ambiente. Cai pro layout padrão
    // do console se não tiver, ou se apontar pra uma chave que não existe.
    gamepad: VIRTUAL_GAMEPAD[cfg.gamepad] || VIRTUAL_GAMEPAD[cfg.core] || null,
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

app.get("/admin", async (req, res) => {
  if (!access.adminConfigured) return adminSetupPage(res);
  if (!access.isAdmin(req)) return adminLoginPage(res);

  // Painel de biblioteca (Fase 9) — contagem simples a partir do catálogo já
  // carregado, sem escanear o Blob. "Verificar biblioteca" cruzando
  // catálogo x arquivos reais no Blob (ROM órfã, capa quebrada) fica pra
  // uma fase própria — precisa listar o storage inteiro, escopo maior.
  const allGames = await library.getAllGames();
  const byPlatform = {};
  let reviewCount = 0;
  let missingCoverCount = 0;
  for (const g of allGames) {
    byPlatform[g.platform] = (byPlatform[g.platform] || 0) + 1;
    if (g.status !== "published") reviewCount++;
    if (!g.cover) missingCoverCount++;
  }
  const libraryStatsHtml = `
    <div class="panel">
      <h2>Biblioteca</h2>
      <p class="panel-note" style="margin-bottom:10px">
        <strong>${allGames.length}</strong> jogo(s) ·
        <strong>${Object.keys(byPlatform).length}</strong> plataforma(s) com jogo ·
        <strong>${platforms.list().length}</strong> plataforma(s) suportada(s) ·
        <strong>${reviewCount}</strong> em revisão ·
        <strong>${missingCoverCount}</strong> sem capa
      </p>
      <div class="chip-row">
        ${platforms.list()
          .filter((p) => byPlatform[p.id])
          .map((p) => `<span class="chip">${escapeHtml(p.label)} · ${byPlatform[p.id]}</span>`)
          .join("")}
      </div>
      <button type="button" class="btn--ghost" id="scan-btn" style="margin-top:12px">Verificar biblioteca</button>
      <div id="scan-result"></div>
    </div>`;

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
      <div class="admin-head-links">
        <a href="/admin/import">importar em lote</a>
        <a href="/admin/logout">sair</a>
      </div>
    </div>

    ${warnings.join("\n")}

    ${libraryStatsHtml}

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
            ${platforms.list().map((p) => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.label)}</option>`).join("")}
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

    <div class="bulk-bar" id="bulk-bar" hidden>
      <span id="bulk-count" class="panel-note" style="margin:0"></span>
      <input class="field" id="bulk-genre" type="text" placeholder="Gênero" style="max-width:140px" />
      <button type="button" class="btn--ghost" data-bulk="genre">Definir gênero</button>
      <input class="field" id="bulk-tag" type="text" placeholder="Tema" style="max-width:120px" />
      <button type="button" class="btn--ghost" data-bulk="add-tag">+ tema</button>
      <button type="button" class="btn--ghost" data-bulk="remove-tag">- tema</button>
      <button type="button" class="btn--ghost" data-bulk="feature">Marcar destaque</button>
      <button type="button" class="btn--ghost" data-bulk="unfeature">Tirar destaque</button>
      <button type="button" class="btn" data-bulk="publish">Publicar</button>
      <button type="button" class="btn--ghost" data-bulk="unpublish">Despublicar</button>
      <button type="button" class="btn--ghost" data-bulk="clear">Limpar seleção</button>
    </div>
    <p class="form-error" id="bulk-error" hidden></p>

    <div class="game-list" id="game-list"></div>
  </div>
  <script>window.__PLATFORMS__ = ${jsonForScript(
    platforms.list().map((p) => ({ id: p.id, label: p.label, extensions: p.extensions }))
  )};</script>
  <script src="/js/admin.js" defer></script>
</body>
</html>`);
});

// ---------------------------------------------------------------------------
// /admin/import — importação em lote (Fase 5). Arrasta/seleciona vários
// arquivos de ROM; cada um vira um item numa fila com detecção de
// plataforma, checagem de duplicata por hash e upload direto pro Blob
// (POST /admin/api/blob/upload-token) sem passar pela function. Entra como
// "review" — publicar continua manual (ver /admin), depois de conferir
// título/capa de cada um.
// ---------------------------------------------------------------------------

app.get("/admin/import", (req, res) => {
  if (!access.adminConfigured) return adminSetupPage(res);
  if (!access.isAdmin(req)) return adminLoginPage(res);

  res.send(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>MYDE · importar em lote</title>
  <link rel="stylesheet" href="/css/style.css" />
  <meta name="robots" content="noindex" />
</head>
<body class="admin-body">
  <div class="admin-wrap">
    <div class="admin-head">
      <h1>Importar em lote</h1>
      <div class="admin-head-links">
        <a href="/admin">&larr; painel</a>
      </div>
    </div>

    ${blob.durable
      ? ""
      : '<div class="banner banner--warn"><strong>Vercel Blob não configurado.</strong> ' +
        "Importação em lote precisa de upload direto pro Blob — configure <code>BLOB_READ_WRITE_TOKEN</code> " +
        'na Vercel (mesmo aviso do painel principal). Em dev local, use o formulário de upload único do <a href="/admin">/admin</a>.</div>'
    }

    <div class="panel">
      <p class="panel-note">
        Arraste vários arquivos de ROM aqui (ou selecione). Plataforma e título são sugeridos
        automaticamente pelo nome do arquivo — confira antes de publicar. Cada jogo entra como
        <strong>revisão</strong>: não aparece na vitrine até você anexar uma capa e publicar
        manualmente em <a href="/admin">/admin</a>.
      </p>
      <label class="check-row">
        <input type="checkbox" id="import-rights" />
        <span>Confirmo que tenho o direito de distribuir publicamente todos os arquivos que vou selecionar agora (homebrew, domínio público, ou eu possuo os direitos de redistribuição).</span>
      </label>
      <div class="dropzone" id="dropzone" aria-disabled="${blob.durable ? "false" : "true"}">
        <p>Arraste as ROMs aqui</p>
        <p class="panel-note" style="margin:4px 0">ou</p>
        <label class="btn btn--ghost" for="import-files" style="cursor:pointer">Selecionar arquivos</label>
        <input type="file" id="import-files" multiple hidden ${blob.durable ? "" : "disabled"} />
      </div>
      <p class="form-error" id="import-error" hidden></p>
    </div>

    <div class="panel" id="import-summary" hidden>
      <p id="import-counts" class="panel-note"></p>
      <a class="btn" href="/admin">Anexar capa e publicar no painel &rarr;</a>
    </div>

    <div class="game-list" id="import-list"></div>
  </div>
  <script>
    window.__PLATFORMS__ = ${jsonForScript(platforms.list().map((p) => ({ id: p.id, label: p.label, extensions: p.extensions })))};
    window.__IMPORT_LIMITS__ = ${jsonForScript(
      Object.fromEntries(platforms.list().map((p) => [p.id, p.maxRomBytes]))
    )};
    window.__BLOB_READY__ = ${blob.durable ? "true" : "false"};
  </script>
  <script type="module" src="/js/import.js"></script>
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

// ---------------------------------------------------------------------------
// Upload direto do navegador pro Vercel Blob (Fase 4 do plano de
// biblioteca) — pro fluxo de upload em massa que vem a seguir, onde a ROM
// não pode passar pelo corpo desta function (a Vercel limita ~4.5MB por
// requisição de function comum). Coexiste com o POST /admin/api/games de
// baixo, que continua sendo o caminho de upload único e o único que
// funciona em dev local (grava em disco sem precisar de Blob real).
//
// Só faz sentido com BLOB_READ_WRITE_TOKEN configurado — sem isso não tem
// como emitir token de verdade pro Blob, e local dev não tem esse token
// (usa o fallback de disco do fluxo antigo).
// ---------------------------------------------------------------------------

app.post("/admin/api/blob/upload-token", requireAdmin, async (req, res) => {
  if (!blob.durable) {
    return res.status(503).json({
      error: "Upload direto pro Blob indisponível — configure BLOB_READ_WRITE_TOKEN na Vercel.",
    });
  }
  try {
    const jsonResponse = await handleBlobUpload({
      body: req.body,
      request: req,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const { allowedContentTypes, maximumSizeInBytes } = blobUploadPolicy.reviewUploadRequest(
          pathname,
          clientPayload
        );
        return { allowedContentTypes, maximumSizeInBytes, addRandomSuffix: false };
      },
    });
    res.json(jsonResponse);
  } catch (err) {
    if (err instanceof blobUploadPolicy.BlobUploadError) {
      return res.status(400).json({ error: err.message });
    }
    console.error("[blob] falha ao emitir token de upload:", err.message);
    res.status(400).json({ error: err.message });
  }
});

// "Verificar biblioteca" (Fase 9) — cruza o catálogo com o Blob de verdade.
// Sem BLOB_READ_WRITE_TOKEN configurado ainda funciona, só sem os
// checks de órfão/URL-quebrada de Blob (blob.list() devolve [] nesse caso —
// ver lib/blob.js), o resto (jogo sem ROM/capa, plataforma desconhecida,
// hash duplicado) continua valendo.
app.get("/admin/api/library/scan", requireAdmin, async (req, res) => {
  try {
    const games = await library.getAllGames();
    const [romBlobs, coverBlobs] = await Promise.all([blob.list("roms"), blob.list("covers")]);
    const issues = libraryScan.scanLibrary(games, romBlobs, coverBlobs);
    res.json({ issues, blobChecked: blob.durable, checkedAt: Date.now() });
  } catch (err) {
    console.error("[library] falha ao verificar biblioteca:", err.message);
    res.status(500).json({ error: err.message });
  }
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
      const staticIds = new Set((await library.getAllGames()).map((g) => g.gameId));

      const { romFilename, coverFilename, entry } = gameEntry.buildGameEntry(req.body, files, staticIds);

      // Hash antes de subir pro Blob: se já existe um jogo com essa ROM
      // exata (mesmo conteúdo, nome de arquivo pode ser outro), não gasta
      // upload nem cria duplicata — nome + plataforma não é critério
      // confiável o bastante sozinho (seções 16/54 do briefing).
      const romHash = romHashLib.hashBuffer(files.rom.buffer);
      const duplicate = await libraryStore.findByHash(romHash);
      if (duplicate) {
        return res.status(409).json({
          error: `Esta ROM já está cadastrada como "${duplicate.title}".`,
          duplicate: true,
          game: duplicate,
        });
      }

      const gameUrl = await blob.upload("roms", romFilename, files.rom.buffer, files.rom.mimetype);
      const cover = await blob.upload("covers", coverFilename, files.cover.buffer, files.cover.mimetype);

      const game = {
        ...entry,
        gameUrl,
        cover,
        romFilename,
        coverFilename,
        romHash,
        status: "published", // esse fluxo sempre tem capa+arquivo completos, publica direto
        addedAt: Date.now(),
      };
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

// Checagem de duplicata ANTES do upload (Fase 5, importação em lote) — o
// navegador calcula o hash da ROM local (Web Crypto) e pergunta aqui antes
// de gastar banda subindo pro Blob. Mesmo índice usado pelo upload único
// (POST /admin/api/games), só que consultado sem exigir arquivo nenhum.
app.post("/admin/api/games/check-hash", requireAdmin, async (req, res) => {
  try {
    const hash = String((req.body && req.body.hash) || "");
    if (!/^[0-9a-f]{64}$/.test(hash)) {
      return res.status(400).json({ error: "hash inválido — precisa ser sha-256 em hex." });
    }
    const existing = await libraryStore.findByHash(hash);
    res.json({ duplicate: Boolean(existing), game: existing || null });
  } catch (err) {
    console.error("[import] falha ao checar hash:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// Fecha o fluxo de importação em lote: a ROM já está no Blob (upload direto
// do navegador, Fase 4) — aqui só valida e grava o metadado. Sempre entra
// como "review", nunca publica sozinho.
app.post("/admin/api/games/import-commit", requireAdmin, async (req, res) => {
  if (!blob.durable) {
    return res.status(503).json({
      error: "Importação em lote precisa do Vercel Blob configurado (BLOB_READ_WRITE_TOKEN).",
    });
  }
  try {
    const staticIds = new Set((await library.getAllGames()).map((g) => g.gameId));
    const { id, entry } = gameEntry.buildImportEntry(req.body, staticIds);

    const romHash = String((req.body && req.body.romHash) || "");
    if (romHash) {
      const duplicate = await libraryStore.findByHash(romHash);
      if (duplicate) {
        return res.status(409).json({
          error: `Esta ROM já está cadastrada como "${duplicate.title}".`,
          duplicate: true,
          game: duplicate,
        });
      }
    }

    const game = {
      ...entry,
      gameUrl: req.body.gameUrl,
      cover: "",
      romFilename: req.body.romFilename,
      coverFilename: "",
      romHash: romHash || null,
      status: "review",
      addedAt: Date.now(),
    };
    await libraryStore.put(game);
    res.json({ game });
  } catch (err) {
    if (err instanceof gameEntry.ValidationError) {
      return res.status(400).json({ error: err.message });
    }
    console.error("[import] falha ao commitar jogo:", err.message);
    res.status(500).json({ error: "Falha ao salvar o jogo. Tenta de novo." });
  }
});

app.patch(
  "/admin/api/games/:id",
  requireAdmin,
  uploadMiddleware.fields([{ name: "cover", maxCount: 1 }]),
  async (req, res) => {
    try {
      const game = await libraryStore.get(req.params.id);
      if (!game) return res.status(404).json({ error: "não encontrado" });

      const newCoverFile = req.files && req.files.cover && req.files.cover[0];
      const { title, genre, tags, coverExt, status, featured } = gameEntry.buildGameUpdate(req.body, newCoverFile);

      const updated = { ...game, title, genre, tags };
      if (status) updated.status = status;
      if (featured !== undefined) updated.featured = featured;

      // Publicar exige capa — um jogo importado em lote (Fase 5) entra sem
      // capa de propósito (seção 50 do briefing) e não pode ir pra vitrine
      // assim, ficaria com imagem quebrada. `updated.cover` já reflete a
      // capa existente; se uma nova vier nesta mesma requisição o upload
      // roda logo abaixo antes de salvar.
      if (updated.status === "published" && !updated.cover && !coverExt) {
        throw new gameEntry.ValidationError("Não dá pra publicar sem capa — envie uma antes.");
      }

      if (coverExt) {
        if (!blob.canUpload) {
          return res.status(503).json({ error: "Upload desligado neste ambiente — configure o Vercel Blob." });
        }
        const coverFilename = `${game.gameId}${coverExt}`;
        updated.cover = await blob.upload("covers", coverFilename, newCoverFile.buffer, newCoverFile.mimetype);
        updated.coverFilename = coverFilename;
        // Apaga a capa antiga só depois do upload da nova dar certo, e só se
        // o nome mudou (extensão diferente) — senão apagaria o arquivo que
        // acabou de substituir a si mesmo.
        if (game.coverFilename && game.coverFilename !== coverFilename) {
          await blob.remove("covers", game.coverFilename, game.cover);
        }
      }

      await libraryStore.put(updated);
      res.json({ game: updated });
    } catch (err) {
      if (err instanceof gameEntry.ValidationError) {
        return res.status(400).json({ error: err.message });
      }
      console.error("[admin] falha ao editar jogo:", err.message);
      res.status(500).json({ error: "Falha ao salvar. Tenta de novo." });
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
