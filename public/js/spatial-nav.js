/* Navegação espacial (d-pad/analógico do gamepad + teclado) pra sensação de
   "launcher" na grade de Consoles e nas fileiras de Coleções — a aba Jogos
   (carrossel 3D) já tinha o próprio ArrowLeft/ArrowRight/Enter (library.js) e
   continua do jeito que está; este módulo não mexe nisso, só noutra área.

   Marca elemento navegável com [data-nav]. A vizinhança é calculada na hora
   (bounding rect), sem precisar declarar uma grade fixa — funciona com
   qualquer layout (grid, fileira horizontal) sem manutenção extra.

   Implementação própria (sem lib externa) escrita do zero olhando só o
   *comportamento* esperado de um launcher de verdade (D-pad move o destaque,
   A confirma, ombro troca de aba) — nenhum código foi copiado de nenhum
   projeto de terceiro. */
(function () {
  "use strict";

  // -------------------------------------------------------------------
  // navegação por proximidade geométrica
  // -------------------------------------------------------------------

  function navCandidates() {
    return Array.prototype.slice
      .call(document.querySelectorAll("[data-nav]"))
      .filter(function (el) { return el.offsetParent !== null && !el.disabled; });
  }

  function currentNavFocus() {
    var active = document.activeElement;
    return active && active.hasAttribute && active.hasAttribute("data-nav") ? active : null;
  }

  // Pontua candidato: quanto mais alinhado no eixo perpendicular e mais perto
  // no eixo do movimento, menor o custo. Candidato "atrás" do movimento nunca
  // entra (filtrado antes de pontuar). Cone de 45°: o eixo do movimento tem
  // que dominar o deslocamento, senão "→" a partir de um card de grade
  // pulava pra um botão da barra de abas só porque ele estava alguns pixels
  // à direita, mesmo estando muito mais em cima do que ao lado.
  function scoreCandidate(dir, from, to) {
    var dx = to.x - from.x;
    var dy = to.y - from.y;
    if (dir === "left" && dx >= -1) return null;
    if (dir === "right" && dx <= 1) return null;
    if (dir === "up" && dy >= -1) return null;
    if (dir === "down" && dy <= 1) return null;

    var primary = dir === "left" || dir === "right" ? Math.abs(dx) : Math.abs(dy);
    var perpendicular = dir === "left" || dir === "right" ? Math.abs(dy) : Math.abs(dx);
    if (perpendicular > primary) return null; // fora do cone de 45°, não é "nessa direção" de verdade
    return primary + perpendicular * 2.2; // desalinhamento pesa mais que distância
  }

  function centerOf(el) {
    var r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  function moveFocus(dir) {
    var candidates = navCandidates();
    if (!candidates.length) return false;

    var current = currentNavFocus();
    if (!current || candidates.indexOf(current) === -1) {
      candidates[0].focus({ preventScroll: true });
      return true;
    }

    var from = centerOf(current);
    var best = null;
    var bestScore = Infinity;
    candidates.forEach(function (el) {
      if (el === current) return;
      var score = scoreCandidate(dir, from, centerOf(el));
      if (score !== null && score < bestScore) {
        bestScore = score;
        best = el;
      }
    });

    if (!best) return false;
    best.focus({ preventScroll: true });
    best.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
    return true;
  }

  document.addEventListener("focusin", function (e) {
    document.querySelectorAll(".is-nav-focused").forEach(function (el) {
      if (el !== e.target) el.classList.remove("is-nav-focused");
    });
    if (e.target.hasAttribute && e.target.hasAttribute("data-nav")) {
      e.target.classList.add("is-nav-focused");
    }
  });

  // -------------------------------------------------------------------
  // teclado — só quando o foco já está numa área [data-nav]; dentro do
  // carrossel da aba Jogos (#stage) quem cuida das setas é o library.js.
  // -------------------------------------------------------------------

  document.addEventListener("keydown", function (e) {
    var arrows = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down" };
    var dir = arrows[e.key];
    if (!dir) return;
    if (!currentNavFocus()) return; // fora da nossa área, não intercepta
    if (moveFocus(dir)) e.preventDefault();
  });

  // -------------------------------------------------------------------
  // gamepad — d-pad + analógico esquerdo, com aceleração ao segurar;
  // A confirma (clica o card ou lança o jogo em foco no carrossel);
  // L1/R1 trocam de aba, igual a launcher de verdade.
  // -------------------------------------------------------------------

  var STANDARD_BUTTON = { A: 0, LB: 4, RB: 5 };
  var STANDARD_DPAD = { up: 12, down: 13, left: 14, right: 15 };
  var AXIS_DEADZONE = 0.5;
  var AXIS_RELEASE = 0.3;

  var held = {}; // direção -> timestamp do último passo aceito
  var accel = {}; // direção -> quantos passos seguidos, acelera o repeat

  function stepAllowed(key) {
    var minDelay = 130;
    var maxDelay = 280;
    var streak = accel[key] || 0;
    var delay = Math.max(minDelay, maxDelay - streak * 25);
    var now = performance.now();
    var last = held[key];
    if (last !== undefined && now - last < delay) return false;
    held[key] = now;
    accel[key] = streak + 1;
    return true;
  }

  function releaseKey(key) {
    delete held[key];
    delete accel[key];
  }

  function dispatchStageKey(key) {
    var stage = document.getElementById("stage");
    if (!stage) return;
    stage.dispatchEvent(new KeyboardEvent("keydown", { key: key, bubbles: true, cancelable: true }));
  }

  function handleDirection(dir) {
    // Sem nenhum elemento [data-nav] focado: a aba Jogos (carrossel) responde
    // a Left/Right como se fosse teclado de verdade; Up/Down não fazem nada
    // ali (o carrossel é só horizontal).
    if (!currentNavFocus()) {
      if (dir === "left") dispatchStageKey("ArrowLeft");
      else if (dir === "right") dispatchStageKey("ArrowRight");
      return;
    }
    moveFocus(dir);
  }

  var buttonWasPressed = {};

  function pollGamepads() {
    var pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (var i = 0; i < pads.length; i++) {
      var pad = pads[i];
      if (!pad) continue;

      Object.keys(STANDARD_DPAD).forEach(function (dir) {
        var idx = STANDARD_DPAD[dir];
        var pressed = pad.buttons[idx] && pad.buttons[idx].pressed;
        var key = "dpad-" + dir;
        if (pressed) {
          if (stepAllowed(key)) handleDirection(dir);
        } else {
          releaseKey(key);
        }
      });

      var ax = pad.axes[0] || 0;
      var ay = pad.axes[1] || 0;
      if (ax > AXIS_DEADZONE) { if (stepAllowed("axis-right")) handleDirection("right"); }
      else if (ax < -AXIS_DEADZONE) { if (stepAllowed("axis-left")) handleDirection("left"); }
      else if (ax > -AXIS_RELEASE && ax < AXIS_RELEASE) { releaseKey("axis-right"); releaseKey("axis-left"); }

      if (ay > AXIS_DEADZONE) { if (stepAllowed("axis-down")) handleDirection("down"); }
      else if (ay < -AXIS_DEADZONE) { if (stepAllowed("axis-up")) handleDirection("up"); }
      else if (ay > -AXIS_RELEASE && ay < AXIS_RELEASE) { releaseKey("axis-down"); releaseKey("axis-up"); }

      var aBtn = pad.buttons[STANDARD_BUTTON.A];
      var aPressed = !!(aBtn && aBtn.pressed);
      if (aPressed && !buttonWasPressed.a) {
        var focused = currentNavFocus();
        if (focused) focused.click();
        else dispatchStageKey("Enter");
      }
      buttonWasPressed.a = aPressed;

      var lb = pad.buttons[STANDARD_BUTTON.LB];
      var rb = pad.buttons[STANDARD_BUTTON.RB];
      var lbPressed = !!(lb && lb.pressed);
      var rbPressed = !!(rb && rb.pressed);
      if (lbPressed && !buttonWasPressed.lb) cycleTab(-1);
      if (rbPressed && !buttonWasPressed.rb) cycleTab(1);
      buttonWasPressed.lb = lbPressed;
      buttonWasPressed.rb = rbPressed;
    }

    requestAnimationFrame(pollGamepads);
  }

  function cycleTab(step) {
    var tabs = Array.prototype.slice.call(document.querySelectorAll("[data-tab-btn]"));
    if (!tabs.length) return;
    var activeIdx = tabs.findIndex(function (t) { return t.classList.contains("is-active"); });
    if (activeIdx === -1) activeIdx = 0;
    var next = (activeIdx + step + tabs.length) % tabs.length;
    tabs[next].click();
  }

  var loopStarted = false;
  window.addEventListener("gamepadconnected", function () {
    if (!loopStarted) {
      loopStarted = true;
      requestAnimationFrame(pollGamepads);
    }
  });
})();
