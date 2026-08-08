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

// Estilo visual por core, só pra deixar as capas do carrossel mais convidativas
const CORE_STYLE = {
  nes: { label: "NES", glyph: "👾", from: "#8b5cf6", to: "#2e1065", accent: "#c4b5fd" },
  snes: { label: "SNES", glyph: "🎮", from: "#14b8a6", to: "#0f3d38", accent: "#5eead4" },
  gba: { label: "GBA", glyph: "⚔️", from: "#f59e0b", to: "#7c2d12", accent: "#fcd34d" },
  segaMD: { label: "MEGA DRIVE", glyph: "🌀", from: "#3b82f6", to: "#1e1b4b", accent: "#93c5fd" },
};
const DEFAULT_CORE_STYLE = { label: "?", glyph: "🕹️", from: "#64748b", to: "#1e293b", accent: "#cbd5e1" };

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

// Ícone de "compartilhar" da própria Apple (quadrado com seta pra cima),
// só pra deixar a instrução do Adicionar à Tela de Início mais reconhecível.
const SHARE_ICON_SVG = `<svg class="inline-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="M8 7l4-4 4 4"/><rect x="4" y="11" width="16" height="10" rx="2"/></svg>`;

app.use(express.static(path.join(__dirname, "public")));

// GET / — tela inicial: lista os jogos disponíveis, com busca e filtro por console
app.get("/", (req, res) => {
  const keychains = loadKeychains();
  const entries = Object.entries(keychains);

  const coresPresent = [...new Set(entries.map(([, cfg]) => cfg.core))];
  const chips = ["all", ...coresPresent]
    .map((core) => {
      const label = core === "all" ? "Todos" : (CORE_STYLE[core] || DEFAULT_CORE_STYLE).label;
      const active = core === "all" ? " chip--active" : "";
      return `<button type="button" class="chip${active}" data-filter="${escapeHtml(core)}">${escapeHtml(label)}</button>`;
    })
    .join("\n");

  const carouselItems = entries
    .map(([keyId, cfg]) => {
      const style = CORE_STYLE[cfg.core] || DEFAULT_CORE_STYLE;
      const genre = cfg.genre || "";
      return `<button type="button" class="carousel-item"
        data-href="/play/${encodeURIComponent(keyId)}"
        data-core="${escapeHtml(cfg.core)}"
        data-title="${escapeHtml(cfg.title.toLowerCase())}"
        data-genre="${escapeHtml(genre.toLowerCase())}"
        data-title-label="${escapeHtml(cfg.title)}"
        data-genre-label="${escapeHtml(genre)}"
        data-console-label="${escapeHtml(style.label)}"
        style="--accent:${style.accent};--cover-from:${style.from};--cover-to:${style.to}"
        aria-label="${escapeHtml(cfg.title)}"
      ><span class="carousel-cover-glyph" aria-hidden="true">${style.glyph}</span></button>`;
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
  <main class="index-wrap index-wrap--carousel">
    <header class="hero hero--compact">
      <h1><span aria-hidden="true">🕹️</span> Joga Retrô</h1>
    </header>

    <div class="library-controls">
      <div class="search-box">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
        <input type="search" id="search-input" placeholder="Buscar jogo ou gênero..." autocomplete="off" />
      </div>
      <div class="chip-row" id="chip-row">
        ${chips}
      </div>
    </div>

    <div class="carousel-wrap">
      <button type="button" class="carousel-nav carousel-nav--prev" id="carousel-prev" aria-label="Jogo anterior">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>
      </button>
      <div class="carousel" id="carousel" tabindex="0">
        <div class="carousel-track" id="carousel-track">
          ${carouselItems}
        </div>
      </div>
      <button type="button" class="carousel-nav carousel-nav--next" id="carousel-next" aria-label="Próximo jogo">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>
      </button>
    </div>

    <p id="empty-state" class="empty-state" hidden>Nenhum jogo encontrado. Tenta outra busca ou filtro.</p>

    <div class="now-playing" id="now-playing">
      <div class="now-playing-tags">
        <span class="card-console-tag" id="now-playing-console"></span>
        <span class="card-genre-tag" id="now-playing-genre"></span>
      </div>
      <div class="now-playing-title" id="now-playing-title"></div>
      <a class="play-btn" id="now-playing-link" href="#">
        Jogar agora
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>
      </a>
    </div>

    <div id="ios-hint" class="ios-hint" hidden>
      <div class="ios-hint-icon">📲</div>
      <div class="ios-hint-body">
        <strong>Jogar em tela cheia no iPhone</strong>
        <span>O iOS não deixa nenhum site esconder a barra do navegador sozinho — só funciona quando você mesmo salva o atalho. Toque em <strong>Compartilhar</strong> ${SHARE_ICON_SVG} → <strong>Adicionar à Tela de Início</strong>, e abra sempre por esse ícone.</span>
        <button type="button" id="ios-hint-close" class="ios-hint-dismiss">Entendi</button>
      </div>
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

    // Carrossel 3D (tipo CoverFlow): arrasta/toca nas capas dos lados pra
    // navegar, busca + filtro por console rebuild o subconjunto visível na
    // hora, tudo client-side — a lista cabe fácil na memória, não precisa
    // de round-trip nenhum pro servidor.
    (function () {
      var carousel = document.getElementById("carousel");
      var track = document.getElementById("carousel-track");
      var itemsAll = Array.prototype.slice.call(track.querySelectorAll(".carousel-item"));
      var prevBtn = document.getElementById("carousel-prev");
      var nextBtn = document.getElementById("carousel-next");
      var searchInput = document.getElementById("search-input");
      var chips = document.querySelectorAll(".chip");
      var emptyState = document.getElementById("empty-state");
      var nowPlaying = document.getElementById("now-playing");
      var npConsole = document.getElementById("now-playing-console");
      var npGenre = document.getElementById("now-playing-genre");
      var npTitle = document.getElementById("now-playing-title");
      var npLink = document.getElementById("now-playing-link");

      var visible = itemsAll.slice();
      var activeIndex = 0;
      var activeFilter = "all";

      function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

      function itemSize() { return carousel.clientWidth < 380 ? 116 : 152; }

      function layout(dragPx) {
        dragPx = dragPx || 0;
        var size = itemSize();
        var spacing = size * 0.62;
        var dragSteps = dragPx / spacing;

        itemsAll.forEach(function (item) {
          item.style.opacity = "0";
          item.style.pointerEvents = "none";
          item.style.zIndex = "0";
        });

        visible.forEach(function (item, i) {
          var pos = (i - activeIndex) - dragSteps;
          var absPos = Math.abs(pos);
          if (absPos > 3.2) return;
          var translateX = pos * spacing;
          var rotateY = clamp(pos * -38, -68, 68);
          var scale = 1 - Math.min(absPos, 1) * 0.3;
          var z = -Math.min(absPos, 3) * 90;
          var opacity = Math.max(0, 1 - absPos * 0.32);
          item.style.width = size + "px";
          item.style.height = size + "px";
          item.style.marginLeft = (-size / 2) + "px";
          item.style.marginTop = (-size / 2) + "px";
          item.style.fontSize = Math.round(size * 0.42) + "px";
          item.style.transform = "translateX(" + translateX + "px) translateZ(" + z + "px) rotateY(" + rotateY + "deg) scale(" + scale + ")";
          item.style.opacity = String(opacity);
          item.style.pointerEvents = "auto";
          item.style.zIndex = String(200 - Math.round(absPos * 10));
        });
      }

      function updateNowPlaying() {
        if (!visible.length) {
          nowPlaying.hidden = true;
          return;
        }
        nowPlaying.hidden = false;
        var item = visible[activeIndex];
        npConsole.textContent = item.dataset.consoleLabel;
        npConsole.style.color = item.style.getPropertyValue("--accent") || "";
        npGenre.textContent = item.dataset.genreLabel;
        npTitle.textContent = item.dataset.titleLabel;
        npLink.href = item.dataset.href;
      }

      function goTo(index) {
        if (!visible.length) return;
        activeIndex = clamp(index, 0, visible.length - 1);
        layout();
        updateNowPlaying();
      }

      function computeVisible() {
        var query = searchInput.value.trim().toLowerCase();
        visible = itemsAll.filter(function (item) {
          var matchesCore = activeFilter === "all" || item.dataset.core === activeFilter;
          var haystack = item.dataset.title + " " + item.dataset.genre;
          var matchesQuery = query === "" || haystack.indexOf(query) !== -1;
          return matchesCore && matchesQuery;
        });
        activeIndex = 0;
        emptyState.hidden = visible.length !== 0;
        layout();
        updateNowPlaying();
      }

      prevBtn.addEventListener("click", function () { goTo(activeIndex - 1); });
      nextBtn.addEventListener("click", function () { goTo(activeIndex + 1); });

      itemsAll.forEach(function (item) {
        item.addEventListener("click", function () {
          var idx = visible.indexOf(item);
          if (idx === -1) return;
          if (idx === activeIndex) {
            window.location.href = item.dataset.href;
          } else {
            goTo(idx);
          }
        });
      });

      // Arrasta com o dedo (ou mouse) pra folhear as capas.
      var dragging = false;
      var startX = 0;
      var currentDrag = 0;

      carousel.addEventListener("pointerdown", function (e) {
        dragging = true;
        startX = e.clientX;
        currentDrag = 0;
        carousel.setPointerCapture(e.pointerId);
        itemsAll.forEach(function (item) { item.style.transition = "none"; });
      });
      carousel.addEventListener("pointermove", function (e) {
        if (!dragging) return;
        currentDrag = e.clientX - startX;
        layout(currentDrag);
      });
      function endDrag() {
        if (!dragging) return;
        dragging = false;
        itemsAll.forEach(function (item) { item.style.transition = ""; });
        var spacing = itemSize() * 0.62;
        var moved = Math.round(-currentDrag / spacing);
        goTo(activeIndex + moved);
      }
      carousel.addEventListener("pointerup", endDrag);
      carousel.addEventListener("pointercancel", endDrag);
      carousel.addEventListener("pointerleave", function () { if (dragging) endDrag(); });

      carousel.addEventListener("keydown", function (e) {
        if (e.key === "ArrowLeft") { e.preventDefault(); goTo(activeIndex - 1); }
        if (e.key === "ArrowRight") { e.preventDefault(); goTo(activeIndex + 1); }
        if (e.key === "Enter" && visible[activeIndex]) { window.location.href = visible[activeIndex].dataset.href; }
      });

      searchInput.addEventListener("input", computeVisible);
      chips.forEach(function (chip) {
        chip.addEventListener("click", function () {
          chips.forEach(function (c) { c.classList.remove("chip--active"); });
          chip.classList.add("chip--active");
          activeFilter = chip.dataset.filter;
          computeVisible();
        });
      });

      window.addEventListener("resize", function () { layout(); });

      computeVisible();
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

  <div id="rotate-hint" class="rotate-hint">🔄 Gire o celular pra jogar em paisagem</div>

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
      //
      // IMPORTANTE: aqui NÃO tem nenhum truque de CSS "fingindo" que a tela
      // girou. O próprio EmulatorJS recalcula a posição dos controles virtuais
      // com base no tamanho real da janela — se a gente gira só visualmente
      // via CSS, ele continua achando que tá em pé e posiciona os botões pro
      // lugar errado (foi exatamente o que quebrou o layout). Só o giro de
      // verdade (screen.orientation.lock, ou a pessoa girando o aparelho) faz
      // o EmulatorJS enxergar landscape de verdade e desenhar certo.
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
