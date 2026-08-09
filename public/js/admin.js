/* Painel de admin: gerar, acompanhar e revogar links de acesso. */
(function () {
  "use strict";

  var list = document.getElementById("token-list");
  if (!list) return;

  var form = document.getElementById("create-form");
  var labelInput = document.getElementById("label");
  var createBtn = document.getElementById("create-btn");

  function fmtDate(ms) {
    if (!ms) return "—";
    return new Date(ms).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function statusPill(t) {
    if (t.revoked) return '<span class="pill pill--dead">revogado</span>';
    if (t.online) return '<span class="pill pill--online">em uso agora</span>';
    if (t.boundDevice) return '<span class="pill pill--bound">ativado</span>';
    return '<span class="pill pill--free">nunca usado</span>';
  }

  function render(tokens) {
    if (!tokens.length) {
      list.innerHTML = '<p class="admin-empty">Nenhum link ainda. Gere o primeiro acima.</p>';
      return;
    }
    list.innerHTML = tokens
      .map(function (t) {
        return (
          '<div class="token' + (t.revoked ? " token--revoked" : "") + '">' +
          '<img class="token-qr" src="' + t.qr + '" alt="QR do link" />' +
          '<div class="token-main">' +
          '<div class="token-label">' + escapeHtml(t.label || "Sem nome") + "</div>" +
          '<div class="token-url">' + escapeHtml(t.url) + "</div>" +
          '<div class="token-status">' +
          statusPill(t) +
          "<span>criado " + fmtDate(t.createdAt) + "</span>" +
          (t.boundAt ? "<span>· ativado " + fmtDate(t.boundAt) + "</span>" : "") +
          (t.opens ? "<span>· " + t.opens + " abertura(s)</span>" : "") +
          "</div>" +
          '<div class="token-actions">' +
          '<button type="button" class="btn--ghost" data-copy="' + escapeHtml(t.url) + '">Copiar link</button>' +
          '<a class="btn--ghost" href="' + t.qr + '" download="myde-' + t.id + '.png">Baixar QR</a>' +
          (t.boundDevice && !t.revoked
            ? '<button type="button" class="btn--ghost" data-reset="' + t.id + '">Religar (liberar aparelho)</button>'
            : "") +
          (!t.revoked
            ? '<button type="button" class="btn--danger" data-revoke="' + t.id + '">Revogar</button>'
            : '<button type="button" class="btn--ghost" data-unrevoke="' + t.id + '">Reativar</button>') +
          '<button type="button" class="btn--danger" data-delete="' + t.id + '">Apagar</button>' +
          "</div></div></div>"
        );
      })
      .join("");
  }

  function load() {
    fetch("/admin/api/tokens", { credentials: "same-origin" })
      .then(function (r) {
        if (r.status === 401) { window.location.reload(); return null; }
        return r.json();
      })
      .then(function (data) { if (data) render(data.tokens); })
      .catch(function () {
        list.innerHTML = '<p class="admin-empty">Falha ao carregar. Recarregue a página.</p>';
      });
  }

  function act(url, method) {
    return fetch(url, { method: method || "POST", credentials: "same-origin" }).then(load);
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    createBtn.disabled = true;
    fetch("/admin/api/tokens", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: labelInput.value.trim() }),
    })
      .then(function () {
        labelInput.value = "";
        load();
      })
      .finally(function () { createBtn.disabled = false; });
  });

  list.addEventListener("click", function (e) {
    var el = e.target.closest("[data-copy],[data-revoke],[data-unrevoke],[data-reset],[data-delete]");
    if (!el) return;

    if (el.dataset.copy) {
      navigator.clipboard.writeText(el.dataset.copy).then(function () {
        var original = el.textContent;
        el.textContent = "Copiado!";
        setTimeout(function () { el.textContent = original; }, 1400);
      });
      return;
    }
    if (el.dataset.revoke) {
      if (confirm("Revogar este link? Quem estiver usando perde o acesso na hora.")) {
        act("/admin/api/tokens/" + el.dataset.revoke + "/revoke");
      }
      return;
    }
    if (el.dataset.unrevoke) {
      act("/admin/api/tokens/" + el.dataset.unrevoke + "/unrevoke");
      return;
    }
    if (el.dataset.reset) {
      if (confirm("Religar este link? Ele solta o aparelho atual e o próximo que abrir fica com ele.")) {
        act("/admin/api/tokens/" + el.dataset.reset + "/reset");
      }
      return;
    }
    if (el.dataset.delete) {
      if (confirm("Apagar este link de vez? Não dá pra desfazer.")) {
        act("/admin/api/tokens/" + el.dataset.delete, "DELETE");
      }
    }
  });

  load();
  setInterval(load, 20000); // mantém o "em uso agora" fresco

  // -------------------------------------------------------------------
  // adicionar jogo (upload de ROM)
  // -------------------------------------------------------------------

  var gameForm = document.getElementById("game-form");
  var gameList = document.getElementById("game-list");
  if (gameForm && gameList) {
    var gameError = document.getElementById("game-error");
    var gameSubmit = document.getElementById("game-submit");

    function fmtBytes(n) {
      if (n > 1024 * 1024) return (n / 1024 / 1024).toFixed(1) + "MB";
      return Math.round(n / 1024) + "KB";
    }

    var currentGames = [];
    var editingId = null;

    function renderGames(games) {
      currentGames = games;
      if (!games.length) {
        gameList.innerHTML = '<p class="admin-empty">Nenhum jogo adicionado por aqui ainda.</p>';
        return;
      }
      gameList.innerHTML = games
        .map(function (g) {
          if (g.gameId === editingId) {
            return (
              '<div class="game-card">' +
              '<div class="game-thumb"><img src="' + escapeHtml(g.cover) + '" alt="" loading="lazy" /></div>' +
              '<div class="game-edit-fields">' +
              '<input class="field" type="text" data-edit-title value="' + escapeHtml(g.title) + '" maxlength="60" placeholder="Título" />' +
              '<input class="field" type="text" data-edit-genre value="' + escapeHtml(g.genre || "") + '" maxlength="40" placeholder="Gênero" />' +
              '<input class="field" type="text" data-edit-tags value="' + escapeHtml((g.tags || []).join(", ")) + '" placeholder="Temas, separados por vírgula" />' +
              '<label class="file-field"><span>Nova capa (opcional)</span>' +
              '<input type="file" data-edit-cover accept="image/*" /></label>' +
              "</div>" +
              '<p class="form-error" data-edit-error hidden></p>' +
              '<div class="game-card-actions">' +
              '<button type="button" class="btn" data-save-game="' + escapeHtml(g.gameId) + '">Salvar</button>' +
              '<button type="button" class="btn--ghost" data-cancel-edit="' + escapeHtml(g.gameId) + '">Cancelar</button>' +
              "</div></div>"
            );
          }
          return (
            '<div class="game-card">' +
            '<div class="game-thumb"><img src="' + escapeHtml(g.cover) + '" alt="" loading="lazy" /></div>' +
            '<div class="game-card-title">' + escapeHtml(g.title) + "</div>" +
            '<div class="game-card-meta">' + escapeHtml(g.core) + (g.genre ? " · " + escapeHtml(g.genre) : "") + "</div>" +
            '<div class="game-card-actions">' +
            '<a class="btn--ghost" href="/play/' + encodeURIComponent(g.gameId) + '" target="_blank" rel="noopener">Abrir</a>' +
            '<button type="button" class="btn--ghost" data-edit-game="' + escapeHtml(g.gameId) + '">Editar</button>' +
            '<button type="button" class="btn--danger" data-delete-game="' + escapeHtml(g.gameId) + '">Apagar</button>' +
            "</div></div>"
          );
        })
        .join("");
    }

    function loadGames() {
      fetch("/admin/api/games", { credentials: "same-origin" })
        .then(function (r) { return r.status === 401 ? null : r.json(); })
        .then(function (data) { if (data) renderGames(data.games); })
        .catch(function () {
          gameList.innerHTML = '<p class="admin-empty">Falha ao carregar. Recarregue a página.</p>';
        });
    }

    gameForm.addEventListener("submit", function (e) {
      e.preventDefault();
      gameError.hidden = true;

      var romInput = document.getElementById("game-rom");
      var coverInput = document.getElementById("game-cover");
      var rom = romInput.files[0];
      var cover = coverInput.files[0];

      // Confere o tamanho no navegador antes de gastar upload — o servidor
      // confere de novo (nunca confia só no lado do cliente).
      var MAX_ROM = 4 * 1024 * 1024;
      var MAX_COVER = 1.5 * 1024 * 1024;
      if (rom && rom.size > MAX_ROM) {
        gameError.textContent = "ROM maior que " + fmtBytes(MAX_ROM) + ".";
        gameError.hidden = false;
        return;
      }
      if (cover && cover.size > MAX_COVER) {
        gameError.textContent = "Capa maior que " + fmtBytes(MAX_COVER) + ".";
        gameError.hidden = false;
        return;
      }

      gameSubmit.disabled = true;
      gameSubmit.textContent = "Enviando...";

      var body = new FormData(gameForm);
      fetch("/admin/api/games", { method: "POST", credentials: "same-origin", body: body })
        .then(function (r) {
          return r.json().then(function (data) { return { ok: r.ok, data: data }; });
        })
        .then(function (res) {
          if (!res.ok) {
            gameError.textContent = (res.data && res.data.error) || "Falha ao adicionar o jogo.";
            gameError.hidden = false;
            return;
          }
          gameForm.reset();
          loadGames();
        })
        .catch(function () {
          gameError.textContent = "Falha de rede. Tenta de novo.";
          gameError.hidden = false;
        })
        .finally(function () {
          gameSubmit.disabled = false;
          gameSubmit.textContent = "Adicionar à biblioteca";
        });
    });

    gameList.addEventListener("click", function (e) {
      var editBtn = e.target.closest("[data-edit-game]");
      if (editBtn) {
        editingId = editBtn.dataset.editGame;
        renderGames(currentGames);
        return;
      }

      var cancelBtn = e.target.closest("[data-cancel-edit]");
      if (cancelBtn) {
        editingId = null;
        renderGames(currentGames);
        return;
      }

      var saveBtn = e.target.closest("[data-save-game]");
      if (saveBtn) {
        var id = saveBtn.dataset.saveGame;
        var card = saveBtn.closest(".game-card");
        var errorEl = card.querySelector("[data-edit-error]");
        var coverInput = card.querySelector("[data-edit-cover]");

        var MAX_COVER = 1.5 * 1024 * 1024;
        if (coverInput.files[0] && coverInput.files[0].size > MAX_COVER) {
          errorEl.textContent = "Capa maior que " + fmtBytes(MAX_COVER) + ".";
          errorEl.hidden = false;
          return;
        }

        var payload = new FormData();
        payload.append("title", card.querySelector("[data-edit-title]").value.trim());
        payload.append("genre", card.querySelector("[data-edit-genre]").value.trim());
        payload.append("tags", card.querySelector("[data-edit-tags]").value);
        if (coverInput.files[0]) payload.append("cover", coverInput.files[0]);

        errorEl.hidden = true;
        saveBtn.disabled = true;
        saveBtn.textContent = "Salvando...";

        // Sem Content-Type manual: o navegador monta o boundary do
        // multipart sozinho a partir do FormData.
        fetch("/admin/api/games/" + encodeURIComponent(id), {
          method: "PATCH",
          credentials: "same-origin",
          body: payload,
        })
          .then(function (r) {
            return r.json().then(function (data) { return { ok: r.ok, data: data }; });
          })
          .then(function (res) {
            if (!res.ok) {
              errorEl.textContent = (res.data && res.data.error) || "Falha ao salvar.";
              errorEl.hidden = false;
              saveBtn.disabled = false;
              saveBtn.textContent = "Salvar";
              return;
            }
            editingId = null;
            loadGames();
          })
          .catch(function () {
            errorEl.textContent = "Falha de rede. Tenta de novo.";
            errorEl.hidden = false;
            saveBtn.disabled = false;
            saveBtn.textContent = "Salvar";
          });
        return;
      }

      var el = e.target.closest("[data-delete-game]");
      if (!el) return;
      if (!confirm('Apagar "' + el.dataset.deleteGame + '" de vez? O arquivo some do ar também.')) return;
      fetch("/admin/api/games/" + encodeURIComponent(el.dataset.deleteGame), {
        method: "DELETE",
        credentials: "same-origin",
      }).then(loadGames);
    });

    loadGames();
  }
})();
