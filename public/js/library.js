/* Vitrine de jogos: carrossel 3D, busca semântica, recomendador e instalação
   do app. Sem framework nem lib de carrossel — só DOM, CSS transform e
   Pointer Events, pra continuar leve em celular fraco. */
(function () {
  "use strict";

  // ---------------------------------------------------------------------
  // utilidades
  // ---------------------------------------------------------------------

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  // "Ação-RPG" -> "acao-rpg". Deixa a busca funcionar sem o usuário precisar
  // acertar acento nenhum.
  function normalize(str) {
    return String(str)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  var prefersReducedMotion =
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---------------------------------------------------------------------
  // busca por tema
  //
  // Cada grupo é um conjunto de palavras que significam a mesma coisa pra
  // quem procura jogo. Digitar QUALQUER palavra do grupo casa com jogos
  // marcados com QUALQUER outra — é por isso que "guerra" acha um jogo
  // taggeado só como "militar", e "sci-fi" acha um taggeado "alienígena".
  // ---------------------------------------------------------------------

  var SYNONYM_GROUPS = [
    ["guerra", "batalha", "militar", "soldado", "exercito", "conflito", "arma", "war"],
    ["espaco", "nave", "alienigena", "galaxia", "estrela", "planeta", "astronauta", "espacial", "orbita", "foguete", "sci-fi", "scifi", "ficcao"],
    ["fantasia", "magia", "medieval", "masmorra", "espada", "cavaleiro", "deusa", "heroi", "feitico"],
    ["dragao", "dragoes", "monstro", "fera", "besta"],
    ["castelo", "fortaleza", "torre", "reino"],
    ["corrida", "carro", "carros", "velocidade", "piloto", "racha", "race", "veloz"],
    ["puzzle", "quebra-cabeca", "raciocinio", "logica", "pensar", "cerebro", "tabuleiro"],
    ["plataforma", "pulo", "pulos", "pular", "platformer"],
    ["luta", "briga", "pancadaria", "arena", "versus", "fighting", "combate", "socos"],
    ["tiro", "atirar", "shooter", "shmup", "disparo"],
    ["terror", "medo", "sombrio", "escuro", "horror", "assustador"],
    ["robo", "robos", "maquina", "mecha", "tecnologia", "cyber", "androide"],
    ["animal", "animais", "bicho", "esquilo", "coruja", "passaro", "aves", "gato", "gatos"],
    ["rapido", "reflexo", "agilidade", "casual", "simples", "curto", "arcade"],
    ["exploracao", "explorar", "mapa", "metroidvania", "descobrir", "aventura"],
    ["multiplayer", "dois jogadores", "amigo", "coop", "2p", "competitivo"],
    ["agua", "mar", "oceano", "liquido", "submarino"],
    ["caverna", "mina", "mineracao", "subterraneo", "pedra", "pedras"],
  ];

  // Índice invertido: palavra -> todas as palavras equivalentes a ela.
  var SYNONYM_INDEX = (function () {
    var index = {};
    SYNONYM_GROUPS.forEach(function (group) {
      group.forEach(function (word) {
        if (!index[word]) index[word] = {};
        group.forEach(function (other) {
          index[word][other] = true;
        });
      });
    });
    return index;
  })();

  // Expande "guerra" -> ["guerra","batalha","militar",...]. Casa também por
  // prefixo, então "batal" já puxa o grupo de "batalha".
  function expandQuery(term) {
    var expanded = {};
    if (SYNONYM_INDEX[term]) {
      Object.keys(SYNONYM_INDEX[term]).forEach(function (w) { expanded[w] = true; });
    } else {
      Object.keys(SYNONYM_INDEX).forEach(function (word) {
        if (word.length >= 3 && word.indexOf(term) === 0) {
          Object.keys(SYNONYM_INDEX[word]).forEach(function (w) { expanded[w] = true; });
        }
      });
    }
    delete expanded[term]; // o termo digitado é tratado à parte, com peso maior
    return Object.keys(expanded);
  }

  // Pontua o quão bem um jogo responde à busca. Filtro binário puro deixava
  // "dragão" devolver 11 jogos com o mesmo peso — o que o usuário quer é ver
  // Twin Dragons primeiro e os parentes temáticos depois. Então: casar é
  // fácil (recall alto), mas a ordem é por relevância.
  //   bate no título       -> muito forte
  //   bate numa tag exata  -> forte
  //   bate no gênero       -> médio
  //   bate via sinônimo    -> fraco (aparece, mas atrás)
  // Todos os termos digitados precisam pontuar (AND entre termos).
  function scoreGame(item, rawQuery) {
    var terms = normalize(rawQuery).split(/\s+/).filter(Boolean);
    if (!terms.length) return 0;

    var total = 0;
    for (var i = 0; i < terms.length; i++) {
      var term = terms[i];
      var best = 0;

      if (item._title.indexOf(term) !== -1) best = Math.max(best, 12);
      if (item._tagSet[term]) best = Math.max(best, 7);
      if (item._genre.indexOf(term) !== -1) best = Math.max(best, 5);
      if (best === 0 && item._haystack.indexOf(term) !== -1) best = Math.max(best, 4);

      if (best === 0) {
        var variants = expandQuery(term);
        for (var v = 0; v < variants.length; v++) {
          var variant = variants[v];
          if (item._tagSet[variant]) { best = Math.max(best, 2.5); continue; }
          if (item._haystack.indexOf(variant) !== -1) best = Math.max(best, 1.5);
        }
      }

      if (best === 0) return 0; // esse termo não bateu de jeito nenhum
      total += best;
    }
    return total;
  }

  // ---------------------------------------------------------------------
  // histórico local (alimenta o recomendador)
  // ---------------------------------------------------------------------

  var HISTORY_KEY = "retro-play-history";

  function readHistory() {
    try {
      var raw = localStorage.getItem(HISTORY_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  // ---------------------------------------------------------------------
  // boot
  // ---------------------------------------------------------------------

  var carousel = document.getElementById("carousel");
  if (!carousel) return;

  var track = document.getElementById("carousel-track");
  var itemsAll = Array.prototype.slice.call(track.querySelectorAll(".carousel-item"));
  var prevBtn = document.getElementById("carousel-prev");
  var nextBtn = document.getElementById("carousel-next");
  var searchInput = document.getElementById("search-input");
  var chips = Array.prototype.slice.call(document.querySelectorAll(".chip"));
  var emptyState = document.getElementById("empty-state");
  var nowPlaying = document.getElementById("now-playing");
  var npConsole = document.getElementById("now-playing-console");
  var npGenre = document.getElementById("now-playing-genre");
  var npTitle = document.getElementById("now-playing-title");
  var npLink = document.getElementById("now-playing-link");
  var npReason = document.getElementById("now-playing-reason");
  var counter = document.getElementById("carousel-counter");
  var backdropA = document.getElementById("theme-backdrop-a");
  var backdropB = document.getElementById("theme-backdrop-b");
  var pickBtn = document.getElementById("ai-pick");

  var visible = itemsAll.slice();
  var activeIndex = 0;
  var activeFilter = "all";
  var frontBackdrop = backdropA;
  var backBackdrop = backdropB;
  var colorCache = {};
  var history = readHistory();

  // Campos de busca pré-calculados por jogo (tudo sem acento, minúsculo).
  itemsAll.forEach(function (item, i) {
    item._title = normalize(item.dataset.title);
    item._genre = normalize(item.dataset.genre);
    item._tags = normalize(item.dataset.tags).split(/\s+/).filter(Boolean);
    item._haystack = item._title + " " + item._genre + " " + item._tags.join(" ");
    item._order = i; // ordem original do catálogo, usada como desempate
    item._tagSet = {};
    item._tags.forEach(function (t) { item._tagSet[t] = true; });
  });

  // ---------------------------------------------------------------------
  // layout do carrossel
  // ---------------------------------------------------------------------

  function itemSize() {
    var w = carousel.clientWidth;
    var h = carousel.clientHeight;
    // A capa cresce até onde couber na largura E na altura disponível — é o
    // que faz a vitrine encher a tela em celular alto sem estourar em tela
    // baixa (paisagem, iPhone SE).
    return clamp(Math.min(w * 0.72, h * 0.88), 104, 320);
  }

  function layout(dragPx) {
    dragPx = dragPx || 0;
    var size = itemSize();
    var spacing = size * 0.62;
    var dragSteps = dragPx / spacing;

    itemsAll.forEach(function (item) {
      item.style.opacity = "0";
      item.style.pointerEvents = "none";
      item.style.zIndex = "0";
      item.classList.remove("is-active");
      item.setAttribute("aria-hidden", "true");
      item.tabIndex = -1;
    });

    visible.forEach(function (item, i) {
      var pos = i - activeIndex - dragSteps;
      var absPos = Math.abs(pos);
      if (absPos > 3.2) return;
      var rotateY = clamp(pos * -38, -68, 68);
      var scale = 1 - Math.min(absPos, 1) * 0.3;
      var z = -Math.min(absPos, 3) * 90;
      item.style.width = size + "px";
      item.style.height = size + "px";
      item.style.marginLeft = -size / 2 + "px";
      item.style.marginTop = -size / 2 + "px";
      item.style.transform =
        "translateX(" + pos * spacing + "px) translateZ(" + z + "px) rotateY(" + rotateY + "deg) scale(" + scale + ")";
      item.style.opacity = String(Math.max(0, 1 - absPos * 0.32));
      item.style.pointerEvents = "auto";
      item.style.zIndex = String(200 - Math.round(absPos * 10));
      item.setAttribute("aria-hidden", "false");
      item.tabIndex = 0;
      if (absPos < 0.01 && !dragPx) item.classList.add("is-active");
    });
  }

  // ---------------------------------------------------------------------
  // tema dinâmico a partir da cor da capa
  // ---------------------------------------------------------------------

  function rgbToHsl(r, g, b) {
    r /= 255;
    g /= 255;
    b /= 255;
    var max = Math.max(r, g, b);
    var min = Math.min(r, g, b);
    var h = 0;
    var s = 0;
    var l = (max + min) / 2;
    if (max !== min) {
      var d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h /= 6;
    }
    return [h * 360, s * 100, l * 100];
  }

  function waitForImage(img) {
    return new Promise(function (resolve) {
      if (img.complete && img.naturalWidth) return resolve();
      img.addEventListener("load", function () { resolve(); }, { once: true });
      img.addEventListener("error", function () { resolve(); }, { once: true });
    });
  }

  function extractTheme(item) {
    var id = item.dataset.href;
    if (colorCache[id]) return Promise.resolve(colorCache[id]);
    var img = item.querySelector(".carousel-cover-img");
    if (!img) return Promise.resolve(null);
    return waitForImage(img).then(function () {
      try {
        var canvas = document.createElement("canvas");
        canvas.width = 20;
        canvas.height = 20;
        var ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, 20, 20);
        var data = ctx.getImageData(0, 0, 20, 20).data;
        var r = 0, g = 0, b = 0, count = 0;
        for (var i = 0; i < data.length; i += 4) {
          if (data[i + 3] < 100) continue;
          r += data[i];
          g += data[i + 1];
          b += data[i + 2];
          count++;
        }
        if (!count) return null;
        var hsl = rgbToHsl(r / count, g / count, b / count);
        var hue = Math.round(hsl[0]);
        var sat = Math.round(clamp(hsl[1], 42, 80));
        var theme = {
          accent: "hsl(" + hue + ", " + sat + "%, 72%)",
          bgFrom: "hsl(" + hue + ", " + Math.min(sat, 55) + "%, 15%)",
          bgTo: "hsl(" + hue + ", " + Math.min(sat, 45) + "%, 5%)",
        };
        colorCache[id] = theme;
        return theme;
      } catch (e) {
        return null;
      }
    });
  }

  function applyTheme(item) {
    extractTheme(item).then(function (theme) {
      if (!theme) return;
      item.style.setProperty("--accent", theme.accent);
      if (visible[activeIndex] !== item) return;
      npConsole.style.color = theme.accent;
      document.documentElement.style.setProperty("--live-accent", theme.accent);
      backBackdrop.style.background =
        "radial-gradient(circle at 50% 18%, " + theme.bgFrom + ", " + theme.bgTo + " 72%)";
      backBackdrop.style.opacity = "1";
      frontBackdrop.style.opacity = "0";
      var swap = frontBackdrop;
      frontBackdrop = backBackdrop;
      backBackdrop = swap;
    });
  }

  // ---------------------------------------------------------------------
  // pré-aquecimento: quando o jogo fica parado no centro, já busca a ROM e o
  // core dele em segundo plano. Quando o usuário toca em "Jogar", boa parte
  // do download já está no cache — é o que corta o tempo de abertura.
  // ---------------------------------------------------------------------

  var prefetched = {};
  var prefetchTimer = null;

  function connectionIsCheap() {
    var c = navigator.connection;
    if (!c) return true;
    if (c.saveData) return false;
    return !/(^|-)2g$/.test(c.effectiveType || "");
  }

  function prefetch(url) {
    if (!url || prefetched[url] || !connectionIsCheap()) return;
    prefetched[url] = true;
    fetch(url, { mode: "cors", credentials: "omit" }).catch(function () {});
  }

  function schedulePrefetch(item) {
    clearTimeout(prefetchTimer);
    prefetchTimer = setTimeout(function () {
      var run = function () {
        prefetch(item.dataset.rom);
        prefetch(item.dataset.coreUrl);
      };
      if (window.requestIdleCallback) window.requestIdleCallback(run, { timeout: 2500 });
      else run();
    }, 550);
  }

  // ---------------------------------------------------------------------
  // painel do jogo ativo
  // ---------------------------------------------------------------------

  function updateNowPlaying(reason) {
    if (!visible.length) {
      nowPlaying.hidden = true;
      counter.textContent = "";
      return;
    }
    nowPlaying.hidden = false;
    var item = visible[activeIndex];
    npConsole.textContent = item.dataset.consoleLabel;
    npGenre.textContent = item.dataset.genreLabel;
    npTitle.textContent = item.dataset.titleLabel;
    npLink.href = item.dataset.href;
    counter.textContent = activeIndex + 1 + " / " + visible.length;

    if (reason) {
      npReason.textContent = reason;
      npReason.hidden = false;
      npReason.classList.remove("is-in");
      void npReason.offsetWidth; // reinicia a animação de entrada
      npReason.classList.add("is-in");
    } else {
      npReason.hidden = true;
    }

    npTitle.classList.remove("is-in");
    void npTitle.offsetWidth;
    npTitle.classList.add("is-in");
  }

  function goTo(index, reason) {
    if (!visible.length) return;
    activeIndex = clamp(index, 0, visible.length - 1);
    layout();
    updateNowPlaying(reason);
    applyTheme(visible[activeIndex]);
    schedulePrefetch(visible[activeIndex]);
  }

  function computeVisible() {
    var query = searchInput.value.trim();
    var pool = itemsAll.filter(function (item) {
      return activeFilter === "all" || item.dataset.core === activeFilter;
    });

    if (!query) {
      visible = pool;
    } else {
      // Só entram os que pontuaram, e o melhor resultado vira o card do meio.
      visible = pool
        .map(function (item) { return { item: item, score: scoreGame(item, query) }; })
        .filter(function (row) { return row.score > 0; })
        .sort(function (a, b) {
          return b.score - a.score || a.item._order - b.item._order;
        })
        .map(function (row) { return row.item; });
    }

    // A ordem do DOM tem que acompanhar a ordem lógica, senão a navegação
    // por Tab e por leitor de tela sai fora de sincronia com o visual. Os
    // que ficaram de fora vão pro fim (continuam no DOM, só não são
    // focáveis — quem cuida disso é o layout()).
    var inVisible = {};
    visible.forEach(function (item) {
      inVisible[item.dataset.href] = true;
      track.appendChild(item);
    });
    itemsAll.forEach(function (item) {
      if (!inVisible[item.dataset.href]) track.appendChild(item);
    });

    activeIndex = 0;
    emptyState.hidden = visible.length !== 0;
    layout();
    updateNowPlaying();
    if (visible.length) {
      applyTheme(visible[activeIndex]);
      schedulePrefetch(visible[activeIndex]);
    }
  }

  // ---------------------------------------------------------------------
  // recomendador
  //
  // Motor de pontuação determinístico (regras, não modelo de linguagem —
  // ver README). Cruza histórico local, horário e variedade pra escolher e
  // devolve junto o motivo em texto, que é o que aparece na tela.
  // ---------------------------------------------------------------------

  function recommend() {
    var pool = visible.length ? visible : itemsAll;
    if (!pool.length) return null;

    var now = new Date();
    var hour = now.getHours();
    var lateNight = hour >= 22 || hour < 6;
    var entries = Object.keys(history);

    // Perfil de gosto: quantas vezes cada tag apareceu no que já foi jogado.
    var tagAffinity = {};
    var lastCore = null;
    var lastPlayedAt = 0;
    entries.forEach(function (id) {
      var rec = history[id];
      (rec.tags || []).forEach(function (tag) {
        tagAffinity[tag] = (tagAffinity[tag] || 0) + rec.count;
      });
      if (rec.at > lastPlayedAt) {
        lastPlayedAt = rec.at;
        lastCore = rec.core;
      }
    });

    var scored = pool.map(function (item) {
      var id = item.dataset.href;
      var rec = history[id];
      var score = 0;
      var reasons = [];

      var affinity = 0;
      item._tags.forEach(function (tag) {
        if (tagAffinity[tag]) affinity += tagAffinity[tag];
      });
      if (affinity > 0) {
        score += Math.min(affinity, 6) * 1.6;
        reasons.push({ weight: 3, text: "combina com o que você jogou" });
      }

      if (rec) {
        // Já jogado: perde força, e quanto mais recente, mais perde.
        var hoursSince = (Date.now() - rec.at) / 3600000;
        score -= hoursSince < 24 ? 7 : 3;
      } else {
        score += 3.5;
        reasons.push({ weight: 2, text: "novidade que você ainda não jogou" });
      }

      if (lastCore && item.dataset.core !== lastCore) {
        score += 1.2;
      }

      var calm = /puzzle|reflexo|estrategia|fisica/.test(normalize(item.dataset.genre));
      if (lateNight && calm) {
        score += 2.5;
        reasons.push({ weight: 4, text: "leve pra essa hora da noite" });
      }
      if (!lateNight && !calm) {
        score += 1;
      }

      score += Math.random() * 2.2; // desempate, evita cair sempre no mesmo

      reasons.sort(function (a, b) { return b.weight - a.weight; });
      return { item: item, score: score, reason: reasons.length ? reasons[0].text : "boa aposta pra começar agora" };
    });

    scored.sort(function (a, b) { return b.score - a.score; });
    return scored[0];
  }

  function runPick() {
    if (!visible.length || pickBtn.classList.contains("is-thinking")) return;
    var choice = recommend();
    if (!choice) return;
    var targetIndex = visible.indexOf(choice.item);
    if (targetIndex === -1) return;

    if (prefersReducedMotion) {
      goTo(targetIndex, "Sugestão: " + choice.reason);
      return;
    }

    // Passa rápido por algumas capas antes de parar na escolhida — dá o
    // feedback de "analisando" em vez de teleportar sem explicação.
    pickBtn.classList.add("is-thinking");
    pickBtn.disabled = true;
    npReason.hidden = false;
    npReason.textContent = "Analisando seu perfil...";
    npReason.classList.add("is-in");

    var hops = Math.min(7, visible.length);
    var i = 0;
    var timer = setInterval(function () {
      i++;
      if (i >= hops) {
        clearInterval(timer);
        pickBtn.classList.remove("is-thinking");
        pickBtn.disabled = false;
        goTo(targetIndex, "Sugestão: " + choice.reason);
        return;
      }
      activeIndex = Math.floor(Math.random() * visible.length);
      layout();
      applyTheme(visible[activeIndex]);
    }, 110);
  }

  // ---------------------------------------------------------------------
  // interação
  // ---------------------------------------------------------------------

  prevBtn.addEventListener("click", function () { goTo(activeIndex - 1); });
  nextBtn.addEventListener("click", function () { goTo(activeIndex + 1); });
  if (pickBtn) pickBtn.addEventListener("click", runPick);

  itemsAll.forEach(function (item) {
    item.addEventListener("click", function () {
      var idx = visible.indexOf(item);
      if (idx === -1) return;
      if (idx === activeIndex) launch(item);
      else goTo(idx);
    });
  });

  // Registra o que foi jogado (alimenta o recomendador na próxima visita).
  function launch(item) {
    var id = item.dataset.href;
    var rec = history[id] || { count: 0 };
    history[id] = {
      count: rec.count + 1,
      at: Date.now(),
      core: item.dataset.core,
      tags: item._tags,
    };
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    } catch (e) {}
    window.location.href = id;
  }

  npLink.addEventListener("click", function (e) {
    if (!visible.length) return;
    e.preventDefault();
    launch(visible[activeIndex]);
  });

  // arrastar pra folhear
  var dragging = false;
  var startX = 0;
  var startY = 0;
  var currentDrag = 0;
  var axisLocked = false;

  carousel.addEventListener("pointerdown", function (e) {
    dragging = true;
    axisLocked = false;
    startX = e.clientX;
    startY = e.clientY;
    currentDrag = 0;
    try { carousel.setPointerCapture(e.pointerId); } catch (err) {}
    itemsAll.forEach(function (item) { item.style.transition = "none"; });
  });

  carousel.addEventListener("pointermove", function (e) {
    if (!dragging) return;
    var dx = e.clientX - startX;
    var dy = e.clientY - startY;
    // Só assume o gesto depois de saber que é horizontal, senão um scroll
    // vertical vira troca de jogo sem querer.
    if (!axisLocked) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      axisLocked = true;
      if (Math.abs(dy) > Math.abs(dx)) {
        dragging = false;
        itemsAll.forEach(function (item) { item.style.transition = ""; });
        return;
      }
    }
    currentDrag = dx;
    layout(currentDrag);
  });

  function endDrag() {
    if (!dragging) return;
    dragging = false;
    itemsAll.forEach(function (item) { item.style.transition = ""; });
    var spacing = itemSize() * 0.62;
    goTo(activeIndex + Math.round(-currentDrag / spacing));
  }

  carousel.addEventListener("pointerup", endDrag);
  carousel.addEventListener("pointercancel", endDrag);
  carousel.addEventListener("pointerleave", function () { if (dragging) endDrag(); });

  carousel.addEventListener("keydown", function (e) {
    if (e.key === "ArrowLeft") { e.preventDefault(); goTo(activeIndex - 1); }
    if (e.key === "ArrowRight") { e.preventDefault(); goTo(activeIndex + 1); }
    if (e.key === "Enter" && visible[activeIndex]) { e.preventDefault(); launch(visible[activeIndex]); }
  });

  searchInput.addEventListener("input", computeVisible);
  searchInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && visible[activeIndex]) {
      e.preventDefault();
      searchInput.blur();
      launch(visible[activeIndex]);
    }
  });

  chips.forEach(function (chip) {
    chip.addEventListener("click", function () {
      chips.forEach(function (c) {
        c.classList.remove("chip--active");
        c.setAttribute("aria-pressed", "false");
      });
      chip.classList.add("chip--active");
      chip.setAttribute("aria-pressed", "true");
      activeFilter = chip.dataset.filter;
      computeVisible();
    });
  });

  var resizeTimer = null;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () { layout(); }, 80);
  });

  computeVisible();

  // ---------------------------------------------------------------------
  // instalar como app
  //
  // Android/Chrome/Edge: o navegador entrega o evento `beforeinstallprompt`,
  // a gente segura ele e dispara no clique — instalação nativa de verdade.
  // iOS: a Apple não expõe essa API pra nenhum navegador, então o clique
  // abre a folha com o passo a passo do "Adicionar à Tela de Início" (é o
  // único caminho que existe lá).
  // ---------------------------------------------------------------------

  (function () {
    var installBtn = document.getElementById("install-btn");
    var sheet = document.getElementById("ios-sheet");
    var sheetClose = document.getElementById("ios-sheet-close");
    if (!installBtn) return;

    var deferredPrompt = null;
    var isStandalone =
      window.navigator.standalone === true ||
      (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches);
    var isIos = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;

    if (isStandalone) {
      installBtn.hidden = true;
      return;
    }

    window.addEventListener("beforeinstallprompt", function (e) {
      e.preventDefault();
      deferredPrompt = e;
      installBtn.hidden = false;
      installBtn.classList.add("is-ready");
    });

    // Sem beforeinstallprompt no iOS, então o botão aparece por conta própria.
    if (isIos) installBtn.hidden = false;

    installBtn.addEventListener("click", function () {
      if (deferredPrompt) {
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then(function (res) {
          if (res && res.outcome === "accepted") installBtn.hidden = true;
          deferredPrompt = null;
        });
        return;
      }
      if (sheet) sheet.hidden = false;
    });

    if (sheetClose) {
      sheetClose.addEventListener("click", function () { sheet.hidden = true; });
    }
    if (sheet) {
      sheet.addEventListener("click", function (e) {
        if (e.target === sheet) sheet.hidden = true;
      });
    }

    window.addEventListener("appinstalled", function () {
      installBtn.hidden = true;
      if (sheet) sheet.hidden = true;
    });
  })();

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("/sw.js").catch(function () {});
    });
  }
})();
