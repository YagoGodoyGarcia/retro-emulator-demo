/* Vitrine MYDE: painel de seleção estilo console.
   Sem framework nem lib de carrossel — DOM, CSS transform e Pointer Events. */
(function () {
  "use strict";

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  // "Ação-RPG" -> "acao-rpg". A busca funciona sem o usuário acertar acento.
  function normalize(str) {
    return String(str)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  var prefersReducedMotion =
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // -------------------------------------------------------------------
  // busca por tema
  //
  // Cada grupo junta palavras que querem dizer a mesma coisa pra quem procura
  // jogo. Digitar qualquer uma casa com jogos marcados com qualquer outra —
  // é por isso que "guerra" acha um jogo taggeado só como "militar".
  // -------------------------------------------------------------------

  var SYNONYM_GROUPS = [
    ["guerra", "batalha", "militar", "soldado", "exercito", "conflito", "arma", "war"],
    ["espaco", "nave", "alienigena", "galaxia", "estrela", "planeta", "astronauta", "espacial", "orbita", "foguete", "sci-fi", "scifi", "ficcao"],
    ["fantasia", "magia", "medieval", "masmorra", "espada", "cavaleiro", "deusa", "heroi", "feitico"],
    ["dragao", "dragoes", "monstro", "fera", "besta"],
    ["castelo", "fortaleza", "torre", "reino"],
    ["corrida", "carro", "carros", "velocidade", "piloto", "racha", "race", "veloz"],
    ["puzzle", "quebra-cabeca", "raciocinio", "logica", "pensar", "cerebro", "tabuleiro"],
    ["plataforma", "pulo", "pulos", "pular", "platformer"],
    // Todo mundo procura pelos dois nomes que definiram o gênero. Não temos
    // esses jogos (são da Nintendo e da Sega), mas devolver "nenhum resultado"
    // é pior do que levar a pessoa até os platformers que mais lembram eles.
    ["mario", "encanador", "bigode", "moedas", "canos", "irmaos", "cogumelo"],
    ["sonic", "ourico", "anel", "aneis", "mascote", "veloz", "loop"],
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

  var SYNONYM_INDEX = (function () {
    var index = {};
    SYNONYM_GROUPS.forEach(function (group) {
      group.forEach(function (word) {
        if (!index[word]) index[word] = {};
        group.forEach(function (other) { index[word][other] = true; });
      });
    });
    return index;
  })();

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
    delete expanded[term]; // o termo digitado vale mais, é contado à parte
    return Object.keys(expanded);
  }

  // Pontua o quanto um jogo responde à busca. Filtro binário puro fazia
  // "dragão" devolver 11 jogos com o mesmo peso; aqui casar é fácil (recall
  // alto) mas a ordem é por relevância, então o óbvio vem primeiro.
  function scoreGame(item, rawQuery) {
    var terms = normalize(rawQuery).split(/\s+/).filter(Boolean);
    if (!terms.length) return 0;

    var total = 0;
    for (var i = 0; i < terms.length; i++) {
      var term = terms[i];
      var best = 0;

      if (item._title.indexOf(term) !== -1) best = 12;
      else if (item._tagSet[term]) best = 7;
      else if (item._genre.indexOf(term) !== -1) best = 5;
      else if (item._haystack.indexOf(term) !== -1) best = 4;

      if (best === 0) {
        var variants = expandQuery(term);
        for (var v = 0; v < variants.length; v++) {
          if (item._tagSet[variants[v]]) { best = Math.max(best, 2.5); continue; }
          if (item._haystack.indexOf(variants[v]) !== -1) best = Math.max(best, 1.5);
        }
      }

      if (best === 0) return 0; // esse termo não bateu de jeito nenhum
      total += best;
    }
    return total;
  }

  // -------------------------------------------------------------------
  // histórico local (alimenta a sugestão)
  // -------------------------------------------------------------------

  var HISTORY_KEY = "myde-play-history";

  function readHistory() {
    try {
      var raw = localStorage.getItem(HISTORY_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  // -------------------------------------------------------------------
  // boot
  // -------------------------------------------------------------------

  var stage = document.getElementById("stage");
  if (!stage) return;

  var rail = document.getElementById("rail");
  var tiles = Array.prototype.slice.call(rail.querySelectorAll(".tile"));
  var prevBtn = document.getElementById("nav-prev");
  var nextBtn = document.getElementById("nav-next");
  var searchPanel = document.getElementById("search-panel");
  var searchToggle = document.getElementById("search-toggle");
  var searchInput = document.getElementById("search-input");
  var chips = Array.prototype.slice.call(document.querySelectorAll(".chip"));
  var emptyState = document.getElementById("empty-state");
  var hud = document.getElementById("hud");
  var hudConsole = document.getElementById("hud-console");
  var hudGenre = document.getElementById("hud-genre");
  var hudTitle = document.getElementById("hud-title");
  var hudNote = document.getElementById("hud-note");
  var hudExclusive = document.getElementById("hud-exclusive");
  var launchLink = document.getElementById("launch");
  var backdropA = document.getElementById("art-a");
  var backdropB = document.getElementById("art-b");
  var pickBtn = document.getElementById("pick");

  var visible = tiles.slice();
  var activeIndex = 0;
  var activeFilter = "all";
  var frontArt = backdropA;
  var backArt = backdropB;
  var colorCache = {};
  var history = readHistory();

  tiles.forEach(function (tile, i) {
    tile._title = normalize(tile.dataset.title);
    tile._genre = normalize(tile.dataset.genre);
    tile._tags = normalize(tile.dataset.tags).split(/\s+/).filter(Boolean);
    tile._haystack = tile._title + " " + tile._genre + " " + tile._tags.join(" ");
    tile._order = i;
    tile._tagSet = {};
    tile._tags.forEach(function (t) { tile._tagSet[t] = true; });
  });

  // -------------------------------------------------------------------
  // layout do palco
  // -------------------------------------------------------------------

  // O card acompanha o formato do espaço livre em vez de ter proporção fixa:
  // num celular em pé ele fica alto (enche a tela), em paisagem/desktop fica
  // largo. A arte nunca é cortada — quem preenche a sobra é a própria arte
  // borrada no fundo do card (ver .tile::before no CSS).
  function tileSize() {
    var w = stage.clientWidth;
    var h = stage.clientHeight;
    var maxW = w * 0.9;
    var maxH = h * 0.96;
    var aspect = clamp(maxW / maxH, 0.72, 1.6); // nem estreito demais, nem panorâmico
    var width = Math.min(maxW, maxH * aspect);
    var height = width / aspect;
    return { w: clamp(width, 170, 760), h: clamp(height, 130, 620) };
  }

  function layout(dragPx) {
    dragPx = dragPx || 0;
    var size = tileSize();
    var spacing = size.w * 0.78;
    // O conteúdo anda JUNTO com o dedo: arrastou 100px pra esquerda, a fileira
    // inteira desce 100px pra esquerda. (Estava somando ao contrário, então a
    // fileira andava contra o dedo e ainda por cima o resultado ao soltar era
    // o oposto do que a animação mostrava.)
    var dragSteps = dragPx / spacing;

    tiles.forEach(function (tile) {
      tile.style.opacity = "0";
      tile.style.pointerEvents = "none";
      tile.style.zIndex = "0";
      tile.classList.remove("is-active");
      tile.setAttribute("aria-hidden", "true");
      tile.tabIndex = -1;
    });

    visible.forEach(function (tile, i) {
      var pos = i - activeIndex + dragSteps;
      var absPos = Math.abs(pos);
      if (absPos > 2.6) return;
      var rotateY = clamp(pos * -22, -44, 44);
      var scale = 1 - Math.min(absPos, 1) * 0.24;
      var z = -Math.min(absPos, 2.6) * 120;
      tile.style.width = size.w + "px";
      tile.style.height = size.h + "px";
      tile.style.marginLeft = -size.w / 2 + "px";
      tile.style.marginTop = -size.h / 2 + "px";
      tile.style.transform =
        "translateX(" + pos * spacing + "px) translateZ(" + z + "px) rotateY(" + rotateY + "deg) scale(" + scale + ")";
      tile.style.opacity = String(Math.max(0, 1 - absPos * 0.42));
      tile.style.pointerEvents = "auto";
      tile.style.zIndex = String(200 - Math.round(absPos * 10));
      tile.setAttribute("aria-hidden", "false");
      tile.tabIndex = 0;
      if (absPos < 0.01 && !dragPx) tile.classList.add("is-active");
    });
  }

  // -------------------------------------------------------------------
  // cor viva a partir da arte
  // -------------------------------------------------------------------

  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    var max = Math.max(r, g, b);
    var min = Math.min(r, g, b);
    var h = 0, s = 0, l = (max + min) / 2;
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

  function extractTheme(tile) {
    var id = tile.dataset.href;
    if (colorCache[id]) return Promise.resolve(colorCache[id]);
    var img = tile.querySelector(".tile-img");
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
          r += data[i]; g += data[i + 1]; b += data[i + 2];
          count++;
        }
        if (!count) return null;
        var hsl = rgbToHsl(r / count, g / count, b / count);
        var theme = {
          accent: "hsl(" + Math.round(hsl[0]) + ", " + Math.round(clamp(hsl[1], 48, 85)) + "%, 74%)",
        };
        colorCache[id] = theme;
        return theme;
      } catch (e) {
        return null;
      }
    });
  }

  // A própria arte, borrada, vira o fundo da tela inteira.
  function applyArt(tile) {
    var img = tile.querySelector(".tile-img");
    if (img) {
      backArt.style.backgroundImage = 'url("' + img.getAttribute("src") + '")';
      backArt.style.opacity = "1";
      frontArt.style.opacity = "0";
      var swap = frontArt;
      frontArt = backArt;
      backArt = swap;
    }
    extractTheme(tile).then(function (theme) {
      if (!theme || visible[activeIndex] !== tile) return;
      tile.style.setProperty("--accent", theme.accent);
      document.documentElement.style.setProperty("--live-accent", theme.accent);
    });
  }

  // -------------------------------------------------------------------
  // pré-aquecimento: com o jogo parado no centro, ROM e core já começam a
  // baixar. É o que corta o tempo entre tocar em JOGAR e estar jogando.
  // -------------------------------------------------------------------

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

  function schedulePrefetch(tile) {
    clearTimeout(prefetchTimer);
    prefetchTimer = setTimeout(function () {
      var run = function () {
        prefetch(tile.dataset.rom);
        prefetch(tile.dataset.coreUrl);
      };
      if (window.requestIdleCallback) window.requestIdleCallback(run, { timeout: 2500 });
      else run();
    }, 550);
  }

  // -------------------------------------------------------------------
  // HUD
  // -------------------------------------------------------------------

  function updateHud(note) {
    if (!visible.length) {
      hud.hidden = true;
      return;
    }
    hud.hidden = false;
    var tile = visible[activeIndex];
    if (hudExclusive) hudExclusive.hidden = !tile.dataset.featured;
    hudConsole.textContent = tile.dataset.consoleLabel;
    hudGenre.textContent = tile.dataset.genreLabel;
    hudTitle.textContent = tile.dataset.titleLabel;
    launchLink.href = tile.dataset.href;

    if (note) {
      hudNote.textContent = note;
      hudNote.hidden = false;
      hudNote.classList.remove("is-in");
      void hudNote.offsetWidth; // reinicia a animação
      hudNote.classList.add("is-in");
    } else {
      hudNote.hidden = true;
    }

    hudTitle.classList.remove("is-in");
    void hudTitle.offsetWidth;
    hudTitle.classList.add("is-in");
  }

  function goTo(index, note) {
    if (!visible.length) return;
    activeIndex = clamp(index, 0, visible.length - 1);
    layout();
    updateHud(note);
    applyArt(visible[activeIndex]);
    schedulePrefetch(visible[activeIndex]);
  }

  function computeVisible() {
    var query = searchInput.value.trim();
    var pool = tiles.filter(function (tile) {
      return activeFilter === "all" || tile.dataset.core === activeFilter;
    });

    if (!query) {
      visible = pool;
    } else {
      visible = pool
        .map(function (tile) { return { tile: tile, score: scoreGame(tile, query) }; })
        .filter(function (row) { return row.score > 0; })
        .sort(function (a, b) { return b.score - a.score || a.tile._order - b.tile._order; })
        .map(function (row) { return row.tile; });
    }

    // Ordem do DOM acompanha a ordem lógica, senão Tab e leitor de tela saem
    // de sincronia com o visual. Quem ficou de fora vai pro fim.
    var inVisible = {};
    visible.forEach(function (tile) {
      inVisible[tile.dataset.href] = true;
      rail.appendChild(tile);
    });
    tiles.forEach(function (tile) {
      if (!inVisible[tile.dataset.href]) rail.appendChild(tile);
    });

    activeIndex = 0;
    emptyState.hidden = visible.length !== 0;
    layout();
    updateHud();
    if (visible.length) {
      applyArt(visible[activeIndex]);
      schedulePrefetch(visible[activeIndex]);
    }
  }

  // -------------------------------------------------------------------
  // sugestão
  //
  // Pontuação determinística (regras + histórico local, sem modelo — ver
  // README). Devolve o jogo e o motivo em texto, que vira o chip do HUD.
  // -------------------------------------------------------------------

  function recommend() {
    var pool = visible.length ? visible : tiles;
    if (!pool.length) return null;

    var hour = new Date().getHours();
    var lateNight = hour >= 22 || hour < 6;

    var tagAffinity = {};
    var lastCore = null;
    var lastPlayedAt = 0;
    Object.keys(history).forEach(function (id) {
      var rec = history[id];
      (rec.tags || []).forEach(function (tag) {
        tagAffinity[tag] = (tagAffinity[tag] || 0) + rec.count;
      });
      if (rec.at > lastPlayedAt) {
        lastPlayedAt = rec.at;
        lastCore = rec.core;
      }
    });

    var scored = pool.map(function (tile) {
      var rec = history[tile.dataset.href];
      var score = 0;
      var reasons = [];

      var affinity = 0;
      tile._tags.forEach(function (tag) {
        if (tagAffinity[tag]) affinity += tagAffinity[tag];
      });
      if (affinity > 0) {
        score += Math.min(affinity, 6) * 1.6;
        reasons.push({ weight: 3, text: "combina com o que você jogou" });
      }

      if (rec) {
        var hoursSince = (Date.now() - rec.at) / 3600000;
        score -= hoursSince < 24 ? 7 : 3;
      } else {
        score += 3.5;
        reasons.push({ weight: 2, text: "novidade que você ainda não jogou" });
      }

      if (lastCore && tile.dataset.core !== lastCore) score += 1.2;

      var calm = /puzzle|reflexo|estrategia|fisica/.test(normalize(tile.dataset.genre));
      if (lateNight && calm) {
        score += 2.5;
        reasons.push({ weight: 4, text: "leve pra essa hora da noite" });
      }
      if (!lateNight && !calm) score += 1;

      score += Math.random() * 2.2; // desempate, evita cair sempre no mesmo

      reasons.sort(function (a, b) { return b.weight - a.weight; });
      return {
        tile: tile,
        score: score,
        reason: reasons.length ? reasons[0].text : "boa aposta pra começar agora",
      };
    });

    scored.sort(function (a, b) { return b.score - a.score; });
    return scored[0];
  }

  function runPick() {
    if (!visible.length || pickBtn.classList.contains("is-thinking")) return;
    var choice = recommend();
    if (!choice) return;
    var target = visible.indexOf(choice.tile);
    if (target === -1) return;

    if (prefersReducedMotion) {
      goTo(target, choice.reason);
      return;
    }

    // Passa rápido por algumas capas antes de parar — mostra que houve uma
    // escolha, em vez de teleportar sem explicação.
    pickBtn.classList.add("is-thinking");
    pickBtn.disabled = true;
    hudNote.hidden = false;
    hudNote.textContent = "Analisando seu perfil...";
    hudNote.classList.add("is-in");

    var hops = Math.min(7, visible.length);
    var i = 0;
    var timer = setInterval(function () {
      i++;
      if (i >= hops) {
        clearInterval(timer);
        pickBtn.classList.remove("is-thinking");
        pickBtn.disabled = false;
        goTo(target, choice.reason);
        return;
      }
      activeIndex = Math.floor(Math.random() * visible.length);
      layout();
      applyArt(visible[activeIndex]);
    }, 110);
  }

  // -------------------------------------------------------------------
  // interação
  // -------------------------------------------------------------------

  prevBtn.addEventListener("click", function () { goTo(activeIndex - 1); });
  nextBtn.addEventListener("click", function () { goTo(activeIndex + 1); });
  if (pickBtn) pickBtn.addEventListener("click", runPick);

  function launch(tile) {
    var id = tile.dataset.href;
    var rec = history[id] || { count: 0 };
    history[id] = {
      count: rec.count + 1,
      at: Date.now(),
      core: tile.dataset.core,
      tags: tile._tags,
    };
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    } catch (e) {}
    window.location.href = id;
  }

  tiles.forEach(function (tile) {
    tile.addEventListener("click", function () {
      if (justDragged) return; // clique que só encerra um arrasto não conta
      var idx = visible.indexOf(tile);
      if (idx === -1) return;
      if (idx === activeIndex) launch(tile);
      else goTo(idx);
    });
  });

  launchLink.addEventListener("click", function (e) {
    if (!visible.length) return;
    e.preventDefault();
    launch(visible[activeIndex]);
  });

  // -------------------------------------------------------------------
  // fileira de cards reutilizável (Consoles agrupa por console, Coleções
  // agrupa por gênero) — extraído do que era só da folha "ver todos".
  // -------------------------------------------------------------------

  function buildCardRow(label, icon, list) {
    var section = document.createElement("section");
    section.className = "library-group";

    var head = document.createElement("h2");
    head.className = "library-group-title";
    head.textContent = (icon ? icon + " " : "") + label;
    var badge = document.createElement("span");
    badge.textContent = list.length;
    head.appendChild(badge);
    section.appendChild(head);

    var row = document.createElement("div");
    row.className = "library-row";

    var grid = document.createElement("div");
    grid.className = "library-grid";
    row.appendChild(grid);

    var prev = document.createElement("button");
    prev.type = "button";
    prev.className = "library-row-nav library-row-nav--prev";
    prev.setAttribute("aria-label", "Rolar " + label + " pra trás");
    prev.innerHTML = "&larr;";
    prev.addEventListener("click", function () {
      grid.scrollBy({ left: -grid.clientWidth * 0.8, behavior: prefersReducedMotion ? "auto" : "smooth" });
    });
    var next = document.createElement("button");
    next.type = "button";
    next.className = "library-row-nav library-row-nav--next";
    next.setAttribute("aria-label", "Rolar " + label + " pra frente");
    next.innerHTML = "&rarr;";
    next.addEventListener("click", function () {
      grid.scrollBy({ left: grid.clientWidth * 0.8, behavior: prefersReducedMotion ? "auto" : "smooth" });
    });
    row.appendChild(prev);
    row.appendChild(next);
    section.appendChild(row);

    list.forEach(function (tile) {
      var card = document.createElement("a");
      card.className = "library-card";
      card.href = tile.dataset.href;
      card.setAttribute("data-nav", "");
      if (tile.dataset.featured) card.classList.add("library-card--featured");

      var thumb = document.createElement("div");
      thumb.className = "library-thumb";
      var img = document.createElement("img");
      img.src = tile.querySelector(".tile-img").src;
      img.alt = "";
      img.loading = "lazy";
      img.decoding = "async";
      img.draggable = false;
      thumb.appendChild(img);
      if (tile.dataset.featured) {
        var star = document.createElement("span");
        star.className = "library-star";
        star.textContent = "Exclusivo";
        thumb.appendChild(star);
      }
      card.appendChild(thumb);

      var name = document.createElement("span");
      name.className = "library-name";
      name.textContent = tile.dataset.titleLabel;
      card.appendChild(name);

      var genre = document.createElement("span");
      genre.className = "library-genre";
      genre.textContent = tile.dataset.genreLabel;
      card.appendChild(genre);

      card.addEventListener("click", function (e) {
        e.preventDefault();
        launch(tile);
      });

      grid.appendChild(card);
    });

    return section;
  }

  // -------------------------------------------------------------------
  // aba Consoles — um tile por plataforma com jogo cadastrado; tocar filtra
  // o carrossel da aba Jogos por aquele console (reaproveita o chip já
  // existente, sem duplicar a lógica de filtro).
  // -------------------------------------------------------------------

  // Ícones em SVG (traço único, sem emoji) — cara de launcher de verdade em
  // vez de emoji, que renderiza diferente (e às vezes feio) em cada
  // sistema. Agrupado por família de hardware, não por console 1-a-1: dá
  // pra cobrir as 35 plataformas do catálogo sem desenhar 35 ícones —
  // cartucho (portáteis/consoles de cartucho), disco (CD/DVD) e controle
  // genérico (arcade, computador doméstico, o resto) cobrem o essencial.
  var ICON_CARTRIDGE =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 3v6H5a2 2 0 0 0-2 2v9a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-9a2 2 0 0 0-2-2h-2V3"/><path d="M9 3v6M15 3v6M9 14v4M13 14v4M17 14v4"/></svg>';
  var ICON_HANDHELD =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="2" width="12" height="20" rx="3"/><rect x="8.5" y="5" width="7" height="6" rx="0.5"/><circle cx="15" cy="16" r="1.1" fill="currentColor" stroke="none"/><circle cx="9" cy="16" r="1.1" fill="currentColor" stroke="none"/></svg>';
  var ICON_DISC =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2.6"/></svg>';
  var ICON_PAD =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="11" rx="5.5"/><path d="M7 10.5v4M5 12.5h4"/><circle cx="16" cy="10.5" r="1" fill="currentColor" stroke="none"/><circle cx="18.5" cy="13" r="1" fill="currentColor" stroke="none"/></svg>';

  var PLATFORM_ICON_FAMILY = {
    nes: ICON_CARTRIDGE, snes: ICON_CARTRIDGE, n64: ICON_CARTRIDGE, nds: ICON_CARTRIDGE,
    gb: ICON_HANDHELD, gba: ICON_HANDHELD, ngp: ICON_HANDHELD, ws: ICON_HANDHELD, lynx: ICON_HANDHELD, vb: ICON_HANDHELD,
    segaCD: ICON_DISC, segaSaturn: ICON_DISC, psx: ICON_DISC, psp: ICON_DISC, "3do": ICON_DISC, pcfx: ICON_DISC, dos: ICON_DISC,
  };

  function iconForCore(core) {
    return PLATFORM_ICON_FAMILY[core] || ICON_PAD;
  }

  function buildConsolesGrid() {
    var grid = document.getElementById("consoles-grid");
    if (!grid || grid.childElementCount) return;

    var groups = {}; // core -> { label, tiles }
    tiles.forEach(function (tile) {
      var core = tile.dataset.core;
      if (!groups[core]) groups[core] = { label: tile.dataset.consoleLabel, tiles: [] };
      groups[core].tiles.push(tile);
    });

    var configuredOrder = window.__PLATFORM_ORDER__ || [];
    var cores = Object.keys(groups).sort(function (a, b) {
      var ia = configuredOrder.indexOf(groups[a].label);
      var ib = configuredOrder.indexOf(groups[b].label);
      if (ia === -1) ia = configuredOrder.length;
      if (ib === -1) ib = configuredOrder.length;
      return ia - ib;
    });

    var frag = document.createDocumentFragment();
    cores.forEach(function (core) {
      var group = groups[core];
      var sample = group.tiles[0];
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "console-tile";
      btn.setAttribute("data-nav", "");
      btn.style.setProperty("--art", "url('" + sample.querySelector(".tile-img").src + "')");
      btn.style.setProperty("--accent", getComputedStyle(sample).getPropertyValue("--accent") || "var(--brand)");
      btn.innerHTML =
        '<span class="console-tile-icon">' + iconForCore(core) + "</span>" +
        '<span class="console-tile-label">' + group.label + "</span>" +
        '<span class="console-tile-count">' + group.tiles.length + (group.tiles.length === 1 ? " jogo" : " jogos") + "</span>";
      btn.addEventListener("click", function () {
        var chip = chips.filter(function (c) { return c.dataset.filter === core; })[0];
        if (chip) chip.click();
        setActiveTab("jogos");
      });
      frag.appendChild(btn);
    });

    grid.appendChild(frag);
  }

  // -------------------------------------------------------------------
  // aba Coleções — agrupado por gênero. Jogo sem gênero cadastrado cai em
  // "Outros" em vez de sumir da aba.
  // -------------------------------------------------------------------

  function buildCollections() {
    var scroller = document.getElementById("collections-scroll");
    if (!scroller || scroller.childElementCount) return;

    var groups = {};
    var order = [];
    tiles.forEach(function (tile) {
      var label = tile.dataset.genreLabel || "Outros";
      if (!groups[label]) { groups[label] = []; order.push(label); }
      groups[label].push(tile);
    });
    order.sort(function (a, b) { return groups[b].length - groups[a].length; });

    var frag = document.createDocumentFragment();
    order.forEach(function (label) {
      frag.appendChild(buildCardRow(label, "", groups[label]));
    });
    scroller.appendChild(frag);
  }

  // -------------------------------------------------------------------
  // troca de aba — Jogos / Consoles / Coleções
  // -------------------------------------------------------------------

  var tabButtons = Array.prototype.slice.call(document.querySelectorAll("[data-tab-btn]"));
  var tabPanels = Array.prototype.slice.call(document.querySelectorAll("[data-tab-panel]"));

  function setActiveTab(tab) {
    tabButtons.forEach(function (btn) {
      var active = btn.dataset.tab === tab;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-selected", String(active));
    });
    tabPanels.forEach(function (panel) {
      panel.hidden = panel.dataset.tabPanel !== tab;
      panel.classList.toggle("is-active", panel.dataset.tabPanel === tab);
    });
    if (tab === "consoles") buildConsolesGrid();
    if (tab === "colecoes") buildCollections();
    if (tab === "jogos") setTimeout(layout, 0); // painel saiu de display:none, recalcula
  }

  tabButtons.forEach(function (btn) {
    btn.addEventListener("click", function () { setActiveTab(btn.dataset.tab); });
  });

  // Arrastar pra folhear.
  //
  // A captura do ponteiro só entra DEPOIS que o gesto vira arrasto de verdade.
  // Capturar já no pointerdown parece inofensivo, mas redireciona o `click`
  // seguinte pro elemento que capturou — o palco — e aí nem as setas nem as
  // capas recebiam clique: tocar em qualquer coisa virava um "arrasto de zero
  // pixel" e a tela não saía do lugar.
  var pending = false;
  var dragging = false;
  var justDragged = false;
  var pointerId = null;
  var startX = 0;
  var startY = 0;
  var currentDrag = 0;
  var lastX = 0;
  var lastT = 0;
  var velocity = 0; // px por ms, pra reconhecer o peteleco rápido

  stage.addEventListener("pointerdown", function (e) {
    if (e.target.closest(".stage-nav")) return; // seta cuida do próprio clique
    pending = true;
    dragging = false;
    pointerId = e.pointerId;
    startX = e.clientX;
    startY = e.clientY;
    lastX = e.clientX;
    lastT = e.timeStamp || Date.now();
    currentDrag = 0;
    velocity = 0;
  });

  stage.addEventListener("pointermove", function (e) {
    if (!pending && !dragging) return;
    var dx = e.clientX - startX;
    var dy = e.clientY - startY;

    if (pending) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      pending = false;
      // Movimento vertical não é nosso: deixa a página/pinch em paz.
      if (Math.abs(dy) > Math.abs(dx)) return;
      dragging = true;
      try { stage.setPointerCapture(pointerId); } catch (err) {}
      tiles.forEach(function (tile) { tile.style.transition = "none"; });
    }

    var now = e.timeStamp || Date.now();
    var dt = now - lastT;
    if (dt > 0) velocity = (e.clientX - lastX) / dt;
    lastX = e.clientX;
    lastT = now;

    // Nas pontas o arrasto fica pesado em vez de travar seco — avisa que
    // acabou a lista sem parecer que o gesto quebrou.
    var spacing = tileSize().w * 0.78;
    var overshoot =
      (activeIndex === 0 && dx > 0) ||
      (activeIndex === visible.length - 1 && dx < 0);
    currentDrag = overshoot ? dx * 0.32 : dx;
    if (overshoot) currentDrag = clamp(currentDrag, -spacing * 0.5, spacing * 0.5);

    layout(currentDrag);
  });

  function endDrag() {
    pending = false;
    if (!dragging) return;
    dragging = false;
    justDragged = true;
    // Solta o clique de novo no próximo tick, senão o `click` que fecha o
    // gesto abriria o jogo sem querer.
    setTimeout(function () { justDragged = false; }, 0);
    try { stage.releasePointerCapture(pointerId); } catch (err) {}
    tiles.forEach(function (tile) { tile.style.transition = ""; });

    var spacing = tileSize().w * 0.78;
    // Peteleco rápido passa um jogo mesmo sem arrastar meia tela; arrasto
    // devagar decide pela distância percorrida.
    var step;
    if (Math.abs(velocity) > 0.45 && Math.abs(currentDrag) > 12) {
      step = velocity < 0 ? 1 : -1;
    } else {
      step = Math.round(-currentDrag / spacing);
    }
    goTo(activeIndex + step);
  }

  stage.addEventListener("pointerup", endDrag);
  stage.addEventListener("pointercancel", endDrag);
  stage.addEventListener("pointerleave", function () { if (dragging) endDrag(); });

  stage.addEventListener("keydown", function (e) {
    if (e.key === "ArrowLeft") { e.preventDefault(); goTo(activeIndex - 1); }
    if (e.key === "ArrowRight") { e.preventDefault(); goTo(activeIndex + 1); }
    if (e.key === "Enter" && visible[activeIndex]) { e.preventDefault(); launch(visible[activeIndex]); }
  });

  // busca escondida até ser chamada — menos coisa na tela
  function toggleSearch(force) {
    var open = typeof force === "boolean" ? force : !searchPanel.classList.contains("is-open");
    searchPanel.classList.toggle("is-open", open);
    searchToggle.classList.toggle("is-on", open);
    searchToggle.setAttribute("aria-expanded", String(open));
    if (open) setTimeout(function () { searchInput.focus(); }, 220);
    else {
      searchInput.blur();
      if (searchInput.value) {
        searchInput.value = "";
        computeVisible();
      }
    }
    setTimeout(layout, 320); // o palco mudou de altura
  }

  searchToggle.addEventListener("click", function () { toggleSearch(); });

  searchInput.addEventListener("input", computeVisible);
  searchInput.addEventListener("keydown", function (e) {
    if (e.key === "Escape") { e.preventDefault(); toggleSearch(false); }
    if (e.key === "Enter" && visible[activeIndex]) {
      e.preventDefault();
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
    resizeTimer = setTimeout(layout, 80);
  });

  computeVisible();

  // -------------------------------------------------------------------
  // instalar como app
  //
  // Android/Chrome/Edge entregam `beforeinstallprompt`: a gente segura e
  // dispara no clique — instalação nativa de verdade. No iOS a Apple não
  // expõe essa API pra navegador nenhum, então o clique abre a folha com o
  // passo a passo do "Adicionar à Tela de Início".
  // -------------------------------------------------------------------

  (function () {
    var installBtn = document.getElementById("install");
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
    });

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

    if (sheetClose) sheetClose.addEventListener("click", function () { sheet.hidden = true; });
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

  // Sinal de vida: mantém o link marcado como "em uso" no painel de admin.
  if (window.__SESSION__) {
    var beat = function () {
      fetch("/api/heartbeat", { method: "POST", credentials: "same-origin" }).catch(function () {});
    };
    beat();
    setInterval(beat, 60000);
  }

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("/sw.js").catch(function () {});
    });
  }
})();
