/* Player: configura o EmulatorJS, resolve o gesto de início (um toque só) e
   pula a tela de abertura do jogo. Lê a config injetada em window.__PLAY__. */
(function () {
  "use strict";

  var CFG = window.__PLAY__;
  if (!CFG) return;

  var loadStartedAt = null;
  var badge = document.getElementById("load-badge");
  var gate = document.getElementById("play-gate");
  var gateBtn = document.getElementById("play-gate-btn");
  var hint = document.getElementById("play-gate-hint");
  var progress = document.getElementById("play-gate-progress");

  // ------------------------------------------------------------------
  // config do EmulatorJS
  // ------------------------------------------------------------------

  window.EJS_player = "#game";
  window.EJS_core = CFG.core;
  window.EJS_gameUrl = CFG.gameUrl;
  window.EJS_pathtodata = CFG.cdn;
  // Separa o save state de cada jogo no IndexedDB do navegador.
  window.EJS_gameID = CFG.id;
  window.EJS_gameName = CFG.title;
  window.EJS_backgroundColor = "#000000";
  if (CFG.gamepad) window.EJS_VirtualGamepadSettings = CFG.gamepad;

  // De propósito SEM EJS_startOnLoaded — ver o comentário no clique do gate.

  // ------------------------------------------------------------------
  // pular a tela de abertura
  //
  // Praticamente todo jogo retro abre num título esperando START. Depois que
  // o core sobe, a gente aperta START algumas vezes espaçadas pra atravessar
  // isso sozinho — o usuário cai direto no jogo em vez de numa tela parada.
  // Espaçado de propósito: jogo nenhum aceita input nos primeiros frames, e
  // apertar rápido demais faz o menu pular duas opções de uma vez.
  // Desligável por jogo com "skipIntro": false no config.
  // ------------------------------------------------------------------

  var START_BUTTON = 3; // índice do START no RetroArch

  function tapStart() {
    try {
      var emu = window.EJS_emulator;
      if (!emu || !emu.gameManager) return;
      emu.gameManager.simulateInput(0, START_BUTTON, 1);
      setTimeout(function () {
        try { emu.gameManager.simulateInput(0, START_BUTTON, 0); } catch (e) {}
      }, 90);
    } catch (e) {}
  }

  function skipIntro() {
    if (CFG.skipIntro === false) return;
    var delays = [1400, 2300, 3200, 4100];
    delays.forEach(function (ms) { setTimeout(tapStart, ms); });
  }

  // ------------------------------------------------------------------
  // ciclo de vida
  // ------------------------------------------------------------------

  function dismissGate() {
    if (!gate || gate.classList.contains("play-gate--hidden")) return;
    gate.classList.add("play-gate--hidden");
    setTimeout(function () {
      if (gate && gate.parentNode) gate.parentNode.removeChild(gate);
    }, 320);
  }

  window.EJS_onGameStart = function () {
    var seconds = loadStartedAt ? ((performance.now() - loadStartedAt) / 1000).toFixed(1) : "?";
    if (badge) {
      badge.textContent = "pronto em " + seconds + "s";
      setTimeout(function () { badge.classList.add("load-badge--fade"); }, 2200);
    }
    dismissGate();
    skipIntro();
  };

  window.EJS_onSaveState = function () {
    console.log("[retro] save state gravado — " + CFG.id);
  };

  window.EJS_onLoadState = function () {
    console.log("[retro] save state carregado — " + CFG.id);
  };

  // ------------------------------------------------------------------
  // o toque que destrava tudo
  //
  // Tela cheia, giro pra paisagem e áudio só funcionam dentro de um gesto
  // real do usuário. EJS_startOnLoaded dispara um clique falso no load, o
  // AudioContext nasce suspenso, e aí o próprio EmulatorJS abre um popup
  // pedindo um SEGUNDO toque ("Click to resume Emulator") — era esse o bug.
  // Aqui o botão nativo dele fica escondido no CSS e a gente repassa o
  // clique de verdade, então tudo acontece dentro do mesmo gesto.
  // ------------------------------------------------------------------

  var canFullscreen = !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);
  var isStandalone =
    window.navigator.standalone === true ||
    (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches);

  if (hint && canFullscreen && !isStandalone) {
    hint.textContent = "Toque para jogar em tela cheia";
  }

  function forwardStartClick(attempt) {
    var realBtn = document.querySelector(".ejs_start_button");
    if (realBtn) {
      realBtn.click();
      return;
    }
    attempt = attempt || 0;
    if (attempt > 120) {
      if (hint) hint.textContent = "Não foi possível carregar. Recarregue a página.";
      if (gateBtn) {
        gateBtn.disabled = false;
        gateBtn.textContent = "↻";
      }
      console.warn("[retro] botão de start do EmulatorJS não apareceu");
      return;
    }
    setTimeout(function () { forwardStartClick(attempt + 1); }, 100);
  }

  function start() {
    var el = document.documentElement;
    if (canFullscreen) {
      try {
        var req = el.requestFullscreen
          ? el.requestFullscreen()
          : el.webkitRequestFullscreen && el.webkitRequestFullscreen();
        Promise.resolve(req).catch(function () {});
      } catch (e) {}
    }
    try {
      if (screen.orientation && screen.orientation.lock) {
        screen.orientation.lock("landscape").catch(function () {});
      }
    } catch (e) {}
    if ("wakeLock" in navigator) {
      navigator.wakeLock.request("screen").catch(function () {});
    }

    if (gateBtn) {
      gateBtn.textContent = "";
      gateBtn.disabled = true;
      gateBtn.classList.add("is-loading");
    }
    if (hint) hint.textContent = "Preparando o jogo...";
    if (progress) progress.hidden = false;
    if (badge) {
      badge.hidden = false;
      badge.textContent = "carregando...";
    }
    loadStartedAt = performance.now();

    forwardStartClick();
  }

  if (gate) gate.addEventListener("click", start, { once: true });

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("/sw.js").catch(function () {});
    });
  }
})();
