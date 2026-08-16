/* Player: configura o EmulatorJS pra iniciar sozinho ao carregar a página
   (sem tela de "toque pra jogar" própria) e pula a tela de abertura do jogo.
   Lê a config injetada em window.__PLAY__. */
(function () {
  "use strict";

  var CFG = window.__PLAY__;
  if (!CFG) return;

  var loadStartedAt = performance.now();
  var badge = document.getElementById("load-badge");
  var retryBox = document.getElementById("boot-retry");
  var retryMessage = document.getElementById("boot-retry-message");
  var retryButton = document.getElementById("boot-retry-btn");
  var audioGate = document.getElementById("audio-gate");
  var audioGateButton = document.getElementById("audio-gate-btn");
  var gameStarted = false;
  var emulatorStarted = false;
  var firstFrameTimer = null;
  var firstFrameSample = null;
  var firstFrameSamples = 0;
  var retryTimer = null;
  var retryKey = "myde-boot-retry:" + CFG.id;
  var alreadyRetried = false;
  try { alreadyRetried = sessionStorage.getItem(retryKey) === "1"; } catch (e) {}

  if (badge) {
    badge.hidden = false;
    badge.textContent = "carregando...";
  }

  function showRetry(message) {
    if (gameStarted || !retryBox) return;
    if (retryMessage) retryMessage.textContent = message;
    retryBox.hidden = false;
  }

  function retryBoot() {
    if (gameStarted) return;
    try { sessionStorage.setItem(retryKey, "1"); } catch (e) {}
    var url = new URL(window.location.href);
    url.searchParams.set("boot-retry", String(Date.now()));
    window.location.replace(url.toString());
  }

  function kickEmulator() {
    var emu = window.EJS_emulator;
    if (!emu) return;
    try {
      if (emu.Module && typeof emu.Module.resumeMainLoop === "function") emu.Module.resumeMainLoop();
      if (emu.elements && emu.elements.parent && typeof emu.elements.parent.focus === "function") emu.elements.parent.focus();
      if (typeof emu.handleResize === "function") emu.handleResize();
    } catch (e) {}
    resumeAudio();
  }

  function frameSignature() {
    var canvas = document.querySelector("#game canvas");
    if (!canvas || !canvas.width || !canvas.height) return null;
    try {
      // WebGL normalmente não preserva o backbuffer após apresentar o frame,
      // então `readPixels()` pode retornar zero mesmo com a imagem visível.
      // `toDataURL()` é usado só durante o boot e mede o canvas composto real.
      var data = canvas.toDataURL("image/png");
      // Um canvas recém-criado pode gerar um PNG preto pequeno antes do
      // primeiro frame. As telas dos jogos deste catálogo são substancialmente
      // maiores; esse limite evita anunciar `pronto` durante essa transição.
      return data.length > 10000 ? String(data.length) : null;
    } catch (e) {
      return null;
    }
  }

  function markReady() {
    if (gameStarted) return;
    gameStarted = true;
    hideAudioGate();
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
    if (firstFrameTimer) {
      clearTimeout(firstFrameTimer);
      firstFrameTimer = null;
    }
    try { sessionStorage.removeItem(retryKey); } catch (e) {}
    var seconds = ((performance.now() - loadStartedAt) / 1000).toFixed(1);
    if (badge) {
      badge.textContent = "pronto em " + seconds + "s";
      setTimeout(function () { badge.classList.add("load-badge--fade"); }, 2200);
    }
    skipIntro();
    // 12s de folga sobre os até 10s que o checkStarted() do EmulatorJS ainda
    // pode ficar de olho no popup depois do jogo já ter "começado".
    setTimeout(silenceStartupWorkarounds, 12000);
  }

  function watchFirstFrame() {
    if (!emulatorStarted || gameStarted) return;
    kickEmulator();
    if (audioIsSuspended() || (navigator.maxTouchPoints > 0 && !gameStarted)) showAudioGate();
    var current = frameSignature();
    if (current) {
      markReady();
      return;
    }
    firstFrameSamples++;
    if (firstFrameSamples < 12) firstFrameTimer = setTimeout(watchFirstFrame, 500);
  }

  if (retryButton) retryButton.addEventListener("click", retryBoot);

  // Se o EmulatorJS não emitir `start`, uma única recarga com query própria
  // recupera o caso de cache/descompressão que só funcionava após F5. Em rede
  // lenta damos mais tempo; depois da tentativa automática mostramos o botão,
  // sem entrar em loop infinito.
  var connection = navigator.connection;
  var slowConnection = connection && (connection.saveData || /(^|-)2g$/.test(connection.effectiveType || ""));
  var retryAfterMs = slowConnection ? 60000 : 30000;
  retryTimer = setTimeout(function () {
    if (gameStarted || document.querySelector(".ejs_start_button")) return;
    if (!alreadyRetried) retryBoot();
    else showRetry("O jogo não iniciou. Toque para tentar novamente.");
  }, retryAfterMs);

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

  // Reportado ao vivo: depois de um tempo jogando, a página ficava lenta e
  // recarregava sozinha (sintoma de crash de aba por pressão de memória).
  // WebGL2 no Safari/iOS tem bug documentado e recorrente de perda de
  // contexto e crescimento de memória até derrubar a aba — acontece em
  // vários projetos sem relação nenhuma com este (Flutter, Unity, o
  // próprio Emscripten), não é bug daqui. Nenhum jogo de console retro
  // (arte 2D em pixel) precisa de recurso nenhum exclusivo do WebGL2 — usar
  // o core "legado" (WebGL1) evita esse caminho problemático inteiro, sem
  // perda perceptível de nada. `forceLegacyCores` é mais direto que tentar
  // desligar via a opção "webgl2Enabled": ele nem deixa o WebGL2 entrar em
  // consideração, em vez de configurar pra não usar.
  window.EJS_forceLegacyCores = true;

  // Menu do EmulatorJS por padrão é feito pra quem desenvolve/testa core, não
  // pra quem abriu um link de QR code pra jogar 2 minutos — e muito menos pra
  // uma criança (Fase 11: "só o básico necessário"). Fica só o que qualquer
  // pessoa reconhece de cara: play/pause, mudo, ajustes (com 1 opção só —
  // ver EJS_hideSettings), tela cheia, salvar e carregar. O resto:
  // - Quick Save/Load: mesma coisa que Save State/Load State, só sem ícone.
  // - cheat/cacheManager/saveSavFiles/loadSavFiles/screenshot/screenRecord/
  //   diskButton/gamepad: recurso técnico ou de quem testa core, não de
  //   quem só quer jogar.
  // - volumeSlider: um mudo (on/off) já resolve; controle fino de volume é
  //   o do próprio aparelho.
  // - exitEmulation: duplicava a setinha "voltar" que já existe sempre
  //   visível no canto — duas formas diferentes de "sair" é confuso.
  // "Context Menu" não é possível esconder: o próprio EmulatorJS ignora
  // override nesse botão (buildButtonOptions, checado na fonte antes de
  // mexer aqui).
  window.EJS_Buttons = {
    cheat: false,
    cacheManager: false,
    saveSavFiles: false,
    loadSavFiles: false,
    screenshot: false,
    screenRecord: false,
    diskButton: false,
    quickSave: false,
    quickLoad: false,
    gamepad: false, // "Configurações do Controle" — remapeia controle físico; o app já tem o virtual pronto
    volumeSlider: false,
    exitEmulation: false,
    // O botão de Ajustes (engrenagem) abre bem mais que os itens fixos que
    // dá pra esconder um por um: testando esta fase apareceu uma categoria
    // inteira "Backend Core Options" com DEZENAS de opções técnicas do core
    // específico daquele console (region, zapper, filtro NTSC, RAM state
    // etc.) — gerada dinamicamente por core, muda de plataforma pra
    // plataforma, e não dá pra listar/esconder cada uma com confiança (35
    // plataformas, cada uma com seu próprio core). Escondendo a engrenagem
    // inteira em vez de tentar aparar item por item — mais simples e
    // garante "só o básico" de verdade em qualquer plataforma.
    settings: false,
  };

  // SEM EJS_hideSettings — de propósito, depois de dois bugs de verdade.
  //
  // addToMenu() em emulator.js (a função que monta cada linha do menu de
  // Ajustes) retorna CEDO se o id está em hideSettings — ANTES de chegar
  // na parte que aplica o padrão (this.menuOptionChanged) E antes de
  // registrar o listener que liga aquela opção ao efeito real dela
  // (settings["id"] -> handleSpecialOptions -> a função que efetivamente
  // faz a coisa acontecer). Ou seja, esconder uma opção não é só tirar ela
  // da tela: pode quebrar o comportamento por trás dela de verdade, sem
  // erro nenhum no console.
  //
  // Dois casos reais encontrados testando esta fase:
  // 1. "save-state-location" escondido → nunca aplicava o padrão →
  //    "Salvar" caía no fluxo de baixar arquivo em vez de gravar no
  //    navegador. "Salvar" não salvava nada de verdade.
  // 2. "virtual-gamepad" escondido → o listener que chama
  //    toggleVirtualGamepad() nunca era registrado → d-pad e botões
  //    NUNCA apareciam em aparelho de toque. Reproduzido de verdade num
  //    iPhone: jogo carregava, sem controle nenhum na tela, impossível
  //    jogar. EJS_defaultOptions sozinho NÃO bastou pra esse — ele muda o
  //    que getSettingValue() lê, mas não religa um listener que nunca foi
  //    registrado.
  //
  // Como o botão de Ajustes inteiro já está escondido (EJS_Buttons.settings
  // acima), ninguém alcança esse menu de qualquer forma — hideSettings não
  // cumpre mais função de simplificar nada, só carregava esse risco. Mais
  // seguro não usar.
  window.EJS_defaultOptions = {
    "save-state-location": "browser",
  };

  // O navegador pode criar o AudioContext somente depois que a ROM e o core
  // terminam de baixar. O auto-start acontece fora da pilha de um gesto e pode
  // deixar o primeiro frame preso em canvas cinza até um F5/toque posterior.
  // Por isso o botão nativo permanece visível e inicia dentro do gesto real do
  // usuário.
  window.EJS_startOnLoaded = false;

  // ------------------------------------------------------------------
  // matar o "Click to resume Emulator"
  //
  // Esse popup (com título "undefined") é do próprio EmulatorJS, no
  // checkStarted(): no Safari com toque ele fica num laço vendo se o
  // AudioContext está "suspended" e, enquanto estiver, mostra um botão
  // pedindo mais um toque. O botão não tem NENHUM handler — ele é só um
  // pretexto pra arrancar do usuário o gesto que destrava o áudio.
  //
  // Por que o contexto nasce suspenso mesmo com um toque real em algum lugar
  // da página: o AudioContext só é criado lá na frente, depois do download
  // do core e da ROM. Nessa altura a janela do gesto já fechou — não tem
  // como "carregar" um gesto por vários segundos de download.
  //
  // A saída é não depender de nenhum toque específico: a gente registra todo
  // AudioContext criado na página e religa todos no próximo toque real, que
  // vai acontecer de qualquer jeito (no direcional, no A, em qualquer
  // lugar). Aí o popup deixa de ter função e é substituído por uma versão
  // silenciosa. Isso é inteiramente independente do EJS_startOnLoaded acima
  // — resolvia esse popup mesmo quando o início dependia de um gate manual.
  // ------------------------------------------------------------------

  var audioContexts = [];

  (function trackAudioContexts() {
    ["AudioContext", "webkitAudioContext"].forEach(function (name) {
      var Native = window[name];
      if (!Native || Native.__mydeTracked) return;
      var Tracked = function (options) {
        var ctx = new Native(options);
        audioContexts.push(ctx);
        try { ctx.resume(); } catch (e) {}
        return ctx;
      };
      Tracked.prototype = Native.prototype;
      Tracked.__mydeTracked = true;
      window[name] = Tracked;
    });
  })();

  function resumeAudio() {
    for (var i = 0; i < audioContexts.length; i++) {
      try {
        if (audioContexts[i].state === "suspended") audioContexts[i].resume();
      } catch (e) {}
    }
    // E o contexto do OpenAL do Emscripten, que é o que o EmulatorJS observa.
    try {
      var emu = window.EJS_emulator;
      var al = emu && emu.Module && emu.Module.AL;
      if (!al || !al.currentCtx) return;
      if (al.currentCtx.audioCtx && al.currentCtx.audioCtx.state === "suspended") {
        al.currentCtx.audioCtx.resume();
      }
      var sources = al.currentCtx.sources || {};
      Object.keys(sources).forEach(function (key) {
        var ctx = sources[key] && sources[key].gain && sources[key].gain.context;
        if (ctx && ctx.state === "suspended") ctx.resume();
      });
    } catch (e) {}
  }

  function audioIsSuspended() {
    var states = audioContexts.map(function (ctx) { return ctx && ctx.state; });
    try {
      var emu = window.EJS_emulator;
      var al = emu && emu.Module && emu.Module.AL;
      var current = al && al.currentCtx;
      if (current && current.audioCtx) states.push(current.audioCtx.state);
      Object.keys((current && current.sources) || {}).forEach(function (key) {
        var ctx = current.sources[key] && current.sources[key].gain && current.sources[key].gain.context;
        if (ctx) states.push(ctx.state);
      });
    } catch (e) {}
    return states.some(function (state) { return state === "suspended"; });
  }

  function hideAudioGate() {
    if (audioGate) audioGate.hidden = true;
  }

  function tryUnlockAudio() {
    resumeAudio();
    kickEmulator();
    setTimeout(function () {
      if (!audioIsSuspended()) hideAudioGate();
    }, 80);
  }

  function showAudioGate() {
    if (!audioGate || gameStarted || !emulatorStarted) return;
    audioGate.hidden = false;
    if (audioGateButton && document.activeElement !== audioGateButton) audioGateButton.focus();
  }

  if (audioGateButton) {
    audioGateButton.addEventListener("click", tryUnlockAudio);
    audioGateButton.addEventListener("pointerdown", tryUnlockAudio, { passive: true });
  }

  // Esses dois (listener de toque + observer) só têm razão de existir ANTES
  // do jogo começar de verdade — é a única janela em que o popup pode
  // aparecer. Manter rodando pra sempre custa trabalho de JS em cima de
  // cada input (dpad, botões) e de cada atualização de tela do próprio
  // emulador, à toa. Por isso saem de cena mais tarde (ver
  // silenceStartupWorkarounds mais abaixo) e são substituídos por um único
  // listener de `visibilitychange`, que cobre o caso real que sobra depois
  // de iniciado (o mobile suspende o AudioContext ao voltar de background).
  //
  // Cuidado que já causou bug de verdade: desligar isso NO INSTANTE do
  // EJS_onGameStart parece certo (o jogo "já começou"), mas o próprio
  // checkStarted() do EmulatorJS continua checando/reabrindo o popup por
  // até 10s DEPOIS disso (40 tentativas × 250ms, ver EJS_ready abaixo) — se
  // o popup aparecesse nessa janela sem o observer pra fechar sozinho, ele
  // ficava preso na tela (tela cinza, só resolvia com F5 e tentar nascer o
  // popup numa hora sem timing ruim). Por isso o desligamento espera bem
  // mais que esses 10s antes de agir.
  var startupEvents = ["pointerdown", "touchstart", "touchend", "mousedown", "keydown"];
  function handleStartupGesture() {
    tryUnlockAudio();
  }
  startupEvents.forEach(function (evt) {
    document.addEventListener(evt, handleStartupGesture, { capture: true, passive: true });
  });

  var startupPollTimer = null;
  var RESUME_TEXT = /resume Emulator|reprendre|reanudar|继续|다시 시작|відновити|devam/i;

  // Troca o checkStarted() do EmulatorJS por um que religa o áudio sozinho em
  // vez de abrir popup. "ready" dispara logo depois que o botão de start é
  // criado, muito antes do startGame() — que é quem chama o checkStarted.
  window.EJS_ready = function () {
    var emu = window.EJS_emulator;
    if (!emu) return;
    emu.checkStarted = function () {
      var tries = 0;
      (function poll() {
        resumeAudio();
        if (++tries < 40) setTimeout(poll, 250);
      })();
    };
  };

  // Cinto e suspensório: versões do EmulatorJS podem abrir o popup de áudio
  // depois do evento `ready`. Em vez de observar cada mutação do document.body
  // (caro durante a montagem do menu e do core), consulta somente os popups em
  // intervalos curtos durante a janela de boot. Isso também evita a corrida em
  // que a caixa é criada vazia e recebe o texto logo depois.
  function dismissResumePopup() {
    var popups = document.querySelectorAll(".ejs_popup_container");
    for (var i = 0; i < popups.length; i++) {
      if (popups[i].style.display === "none") continue;
      if (!RESUME_TEXT.test(popups[i].textContent)) continue;
      popups[i].style.display = "none";
      resumeAudio();
    }
  }

  (function pollResumePopup() {
    if (workaroundsSilenced) return;
    dismissResumePopup();
    startupPollTimer = setTimeout(pollResumePopup, 250);
  })();

  // Desliga o listener por-toque e o polling de popup assim que o jogo está
  // de fato rodando, e troca por um único listener de visibilitychange
  // — o áudio só volta a suspender sozinho quando a aba sai e volta de
  // background, não a cada input do jogador.
  var workaroundsSilenced = false;
  function silenceStartupWorkarounds() {
    if (workaroundsSilenced) return; // trava — ver o timeout de segurança logo abaixo, que também chama isto
    workaroundsSilenced = true;
    startupEvents.forEach(function (evt) {
      document.removeEventListener(evt, handleStartupGesture, { capture: true });
    });
    if (startupPollTimer) {
      clearTimeout(startupPollTimer);
      startupPollTimer = null;
    }
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible") resumeAudio();
    });
  }

  // Trava de segurança independente do EJS_onGameStart: se por algum motivo
  // o jogo nunca disparar "start" (core que falha ao subir, ROM que trava
  // antes do primeiro frame etc.), os listeners de toque + o polling de popup
  // continuariam rodando pra sempre, sem o desligamento
  // normal de 12s depois do início. 20s aqui é só o teto — em uso normal
  // quem desliga primeiro é sempre o EJS_onGameStart, isto é rede de
  // segurança, não o caminho esperado.
  setTimeout(silenceStartupWorkarounds, 20000);

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
  var A_BUTTON = 1; // índice do A no controle Mega Drive

  function tapButton(button) {
    try {
      var emu = window.EJS_emulator;
      if (!emu || !emu.gameManager) return;
      emu.gameManager.simulateInput(0, button, 1);
      setTimeout(function () {
        try { emu.gameManager.simulateInput(0, button, 0); } catch (e) {}
      }, 90);
    } catch (e) {}
  }

  function tapStart() { tapButton(START_BUTTON); }

  function skipIntro() {
    if (CFG.skipIntro === false) return;
    if (CFG.core === "segaMD") {
      // O primeiro frame detectado pode ainda ser o logo da SEGA. Há uma
      // janela curta de tentativas para que pelo menos um START caia na tela
      // de título; depois A confirma 1 PLAYER no Sonic 2.
      [7000, 9500, 12000].forEach(function (ms) {
        setTimeout(tapStart, ms);
      });
      setTimeout(function () { tapButton(A_BUTTON); }, 13500);
      return;
    }
    var delays = [1400, 2300, 3200, 4100];
    delays.forEach(function (ms) { setTimeout(tapStart, ms); });
  }

  // ------------------------------------------------------------------
  // ciclo de vida
  // ------------------------------------------------------------------

  window.EJS_onGameStart = function () {
    emulatorStarted = true;
    if (badge) badge.textContent = "iniciando...";
    kickEmulator();
    firstFrameTimer = setTimeout(watchFirstFrame, 250);
  };

  // De propósito SEM window.EJS_onSaveState / window.EJS_onLoadState.
  //
  // Achado testando esta fase: registrar esses dois hooks NÃO é só "avisa
  // depois que salvou" — o próprio EmulatorJS usa `callEvent(...).length`
  // pra decidir se "alguém de fora assumiu" aquele evento, e se assumiu
  // (called > 0) ele CANCELA a própria gravação em disco/IndexedDB antes de
  // chegar nela (visto na fonte, addButton do saveState/loadState em
  // emulator.js: "const called = this.callEvent(...); if (called > 0)
  // return;"). Ou seja: só de ter esses dois `window.EJS_on*` definidos
  // (mesmo que só pra um console.log) o "Salvar"/"Carregar" do EmulatorJS
  // parava de gravar de verdade. Corrigido não registrando esses hooks —
  // o feedback (toast) agora vem de perto do clique nos nossos botões
  // abaixo, não de um evento que troca o comportamento de salvar.

  // ------------------------------------------------------------------
  // botões grandes de Salvar/Carregar (Fase 11)
  //
  // O menu do EmulatorJS já tem Save State/Load State, mas fica dentro de
  // uma barra que aparece e some sozinha (só mostra com toque/mouse perto
  // da borda, e some depois de alguns segundos) — nada óbvio pra quem não
  // já usou um emulador antes, muito menos pra uma criança. Estes dois
  // botões ficam sempre visíveis e clicam nos botões REAIS do EmulatorJS
  // por baixo (via elements.bottomBar, a mesma referência que o próprio
  // EmulatorJS usa pra si — não é reimplementar a lógica de salvar, é só
  // apertar o botão de verdade por fora), então herdam qualquer
  // comportamento dele automaticamente (tela de troca de local de save,
  // etc.) sem duplicar nada.
  // ------------------------------------------------------------------

  // Achado testando esta fase (nº 2): o botão real de Save State também
  // tira uma screenshot da tela pra ilustrar o save antes de gravar
  // (`await this.takeScreenshot(...)`, sem timeout nem tratamento de erro
  // do lado do EmulatorJS) — coisa que a gente nem usa, já que não expõe
  // navegador de múltiplos saves nenhum aqui. Forward-clicar nesse botão
  // amarra o "Salvar" inteiro a essa captura: se ela travar ou demorar (viu
  // acontecer aqui), o salvamento nem chega a rodar e ninguém sabe por quê
  // — o oposto de "fácil e sem dificuldade". Por isso estes dois botões NÃO
  // clicam no botão real — chamam a mesma gravação/leitura de baixo nível
  // que ele usa por baixo dos panos (gameManager.getState()/loadState() +
  // storage.states, os mesmos objetos que o próprio EmulatorJS usa pra se
  // salvar — não é reinventar o formato do save, só pular a parte da
  // screenshot que é só decorativa aqui).
  var saveBtn = document.getElementById("quick-save");
  var loadBtn = document.getElementById("quick-load");

  function saveFileName() {
    var emu = window.EJS_emulator;
    return emu.getBaseFileName() + ".state";
  }

  if (saveBtn) {
    saveBtn.addEventListener("click", function () {
      var emu = window.EJS_emulator;
      if (!emu || !emu.gameManager) return;
      try {
        var state = emu.gameManager.getState();
        emu.storage.states.put(saveFileName(), state);
        showToast("💾 Jogo salvo!");
      } catch (e) {
        showToast("⚠️ Não deu pra salvar, tenta de novo");
      }
    });
  }
  if (loadBtn) {
    loadBtn.addEventListener("click", function () {
      var emu = window.EJS_emulator;
      if (!emu || !emu.gameManager) return;
      emu.storage.states.get(saveFileName()).then(function (state) {
        if (!state) {
          showToast("Nenhum save salvo ainda");
          return;
        }
        emu.gameManager.loadState(state);
        showToast("▶️ Continuando de onde parou");
      }).catch(function () {
        showToast("⚠️ Não deu pra carregar, tenta de novo");
      });
    });
  }

  var toastTimer = null;
  function showToast(text) {
    var el = document.getElementById("save-toast");
    if (!el) return;
    el.textContent = text;
    el.hidden = false;
    el.classList.remove("save-toast--in");
    void el.offsetWidth;
    el.classList.add("save-toast--in");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      el.classList.remove("save-toast--in");
      setTimeout(function () { el.hidden = true; }, 260);
    }, 2000);
  }

  // ------------------------------------------------------------------
  // o toque que destrava tela cheia/paisagem
  //
  // Diferente do áudio (que religa em QUALQUER toque, sempre — ver acima),
  // tela cheia e trava de orientação exigem ser chamadas DENTRO da pilha de
  // um gesto de verdade, sincronamente. Sem gate dedicado, esse gesto passa
  // a ser o primeiro toque real no jogo (d-pad, botão) — a pessoa já ia
  // tocar aí pra jogar de qualquer forma, então não é um toque a mais, só
  // deixa de ser um toque EXTRA numa tela própria antes do jogo aparecer.
  // Só dispara uma vez; depois disso o jogo já está em tela cheia/paisagem
  // (ou o navegador recusou, e não adianta insistir a cada toque).
  // ------------------------------------------------------------------

  var canFullscreen = !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);
  var immersiveRequested = false; // um listener por tipo de evento dispara "once" cada um — sem essa trava, o primeiro toque real de tipos diferentes (ex.: pointerdown e depois keydown) chamaria isto duas vezes.

  function requestImmersive() {
    if (immersiveRequested) return;
    immersiveRequested = true;
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
  }

  startupEvents.forEach(function (evt) {
    document.addEventListener(evt, requestImmersive, { capture: true, passive: true, once: true });
  });

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("/sw.js").catch(function () {});
    });
  }
})();
