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
})();
