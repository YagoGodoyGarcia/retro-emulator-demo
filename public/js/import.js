/* Importação em lote (Fase 5): arrasta/seleciona várias ROMs, detecta
 * plataforma pelo nome do arquivo, calcula hash (Web Crypto) e checa
 * duplicata ANTES de subir, upload direto pro Blob (sem passar pela
 * function — Fase 4) e commita o metadado como "review". Fila com no
 * máximo 3 uploads simultâneos (seção 47 do briefing: nada de 50 de uma
 * vez saturando rede/memória).
 */

// jsdelivr serve o arquivo cru do pacote, que tem `import "crypto"` (Node)
// sobrando pro bundler resolver via o campo "browser" do package.json —
// isso quebra direto no navegador (visto testando de verdade, não só lendo
// o código). esm.sh já entrega pré-processado pra browser, sem isso.
import { upload } from "https://esm.sh/@vercel/blob@2.7.0/client";

const PLATFORMS = window.__PLATFORMS__ || [];
const BLOB_READY = window.__BLOB_READY__ === true;

// Extensão -> plataforma, só quando a extensão pertence a uma única
// plataforma. Várias plataformas de archive (arcade, mame, dos) usam
// ".zip" — se essa extensão apontasse pra uma só (a última declarada em
// lib/platforms.js "ganhava" por sobrescrita), um romset zipado de outra
// plataforma era auto-detectado errado e ia pro core errado (ex.: ROM de
// NDS zipada virando "MS-DOS", que falha ao tentar montar o zip como
// disco). Extensão ambígua cai em "needs-platform" — o mesmo fluxo de
// escolha manual que já existe pra extensão desconhecida.
const EXT_TO_PLATFORM = {};
const EXT_PLATFORM_COUNT = {};
PLATFORMS.forEach((p) =>
  (p.extensions || []).forEach((ext) => {
    EXT_PLATFORM_COUNT[ext] = (EXT_PLATFORM_COUNT[ext] || 0) + 1;
    EXT_TO_PLATFORM[ext] = p.id;
  })
);
Object.keys(EXT_PLATFORM_COUNT).forEach((ext) => {
  if (EXT_PLATFORM_COUNT[ext] > 1) delete EXT_TO_PLATFORM[ext];
});

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function extOf(name) {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot).toLowerCase();
}

function suggestTitle(filename) {
  const noExt = filename.replace(/\.[^./\\]+$/, "");
  const cleaned = noExt.replace(/\([^)]*\)/g, " ").replace(/\[[^\]]*\]/g, " ").replace(/\s+/g, " ").trim();
  return cleaned || noExt.trim();
}

async function sha256Hex(file) {
  const buf = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// -------------------------------------------------------------------------
// estado
// -------------------------------------------------------------------------

let seq = 0;
const items = new Map();

function addFiles(fileList) {
  Array.from(fileList).forEach((file) => {
    const platform = EXT_TO_PLATFORM[extOf(file.name)] || null;
    const id = "imp-" + ++seq;
    items.set(id, {
      id,
      file,
      platform,
      title: suggestTitle(file.name),
      status: platform ? "pending" : "needs-platform",
      error: null,
      duplicateOf: null,
      resultGame: null,
    });
  });
  render();
  pump();
}

// -------------------------------------------------------------------------
// fila — no máximo 3 uploads ao mesmo tempo
// -------------------------------------------------------------------------

const CONCURRENCY = 3;
let active = 0;

function pump() {
  while (active < CONCURRENCY) {
    const next = Array.from(items.values()).find((it) => it.status === "pending");
    if (!next) return;
    active++;
    next.status = "hashing";
    render();
    processItem(next).finally(() => {
      active--;
      pump();
    });
  }
}

async function processItem(item) {
  try {
    const hash = await sha256Hex(item.file);
    item.hash = hash;

    item.status = "checking";
    render();
    const dup = await fetch("/admin/api/games/check-hash", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hash }),
    }).then((r) => r.json());

    if (dup.duplicate) {
      item.status = "duplicate";
      item.duplicateOf = dup.game;
      render();
      return;
    }

    item.status = "uploading";
    render();
    const pathname = `roms/${item.platform}/${item.id}${extOf(item.file.name)}`;
    const blob = await upload(pathname, item.file, {
      access: "public",
      handleUploadUrl: "/admin/api/blob/upload-token",
      clientPayload: JSON.stringify({ kind: "roms", platform: item.platform }),
    });

    item.status = "committing";
    render();
    const commitRes = await fetch("/admin/api/games/import-commit", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: item.title,
        core: item.platform,
        genre: "",
        tags: "",
        confirmRights: "true",
        gameUrl: blob.url,
        romFilename: pathname.split("/").pop(),
        romHash: hash,
      }),
    });
    const data = await commitRes.json();
    if (!commitRes.ok) {
      if (data.duplicate) {
        item.status = "duplicate";
        item.duplicateOf = data.game;
      } else {
        item.status = "error";
        item.error = data.error || "Falha ao salvar.";
      }
      render();
      return;
    }

    item.status = "ready";
    item.resultGame = data.game;
    render();
  } catch (err) {
    item.status = "error";
    item.error = (err && err.message) || "Falha inesperada.";
    render();
  }
}

function retry(id) {
  const item = items.get(id);
  if (!item) return;
  item.status = "pending";
  item.error = null;
  render();
  pump();
}

function confirmPlatform(id, platform) {
  const item = items.get(id);
  if (!item || !platform) return;
  item.platform = platform;
  item.status = "pending";
  render();
  pump();
}

function removeItem(id) {
  items.delete(id);
  render();
}

// -------------------------------------------------------------------------
// UI
// -------------------------------------------------------------------------

const STATUS_LABEL = {
  pending: "na fila",
  hashing: "calculando hash...",
  checking: "checando duplicata...",
  uploading: "enviando...",
  committing: "salvando...",
  ready: "pronto (revisão)",
  duplicate: "duplicado",
  error: "falhou",
  "needs-platform": "plataforma?",
};

const STATUS_CLASS = {
  pending: "pending",
  hashing: "working",
  checking: "working",
  uploading: "working",
  committing: "working",
  ready: "ready",
  duplicate: "duplicate",
  error: "error",
  "needs-platform": "warning",
};

function platformOptions(selected) {
  return (
    '<option value="" disabled' + (selected ? "" : " selected") + '>Console</option>' +
    PLATFORMS.map((p) => `<option value="${escapeHtml(p.id)}"${p.id === selected ? " selected" : ""}>${escapeHtml(p.label)}</option>`).join("")
  );
}

function itemCard(item) {
  const statusBadge =
    '<span class="import-item-status import-item-status--' + STATUS_CLASS[item.status] + '">' +
    escapeHtml(STATUS_LABEL[item.status] || item.status) +
    "</span>";

  let extra = "";
  if (item.status === "needs-platform") {
    extra =
      '<div class="field-row" style="margin-top:8px">' +
      '<select class="field" data-platform-select="' + item.id + '">' + platformOptions(null) + "</select>" +
      '<button type="button" class="btn--ghost" data-confirm-platform="' + item.id + '">Confirmar</button>' +
      "</div>";
  } else if (item.status === "error") {
    extra =
      '<p class="form-error" style="margin-top:6px">' + escapeHtml(item.error || "Falha.") + "</p>" +
      '<button type="button" class="btn--ghost" data-retry="' + item.id + '" style="margin-top:6px">Tentar novamente</button>';
  } else if (item.status === "duplicate" && item.duplicateOf) {
    extra =
      '<p class="panel-note" style="margin:6px 0 0">Já cadastrado como "' +
      escapeHtml(item.duplicateOf.title) +
      '".</p>';
  } else if (item.status === "ready") {
    extra = '<p class="panel-note" style="margin:6px 0 0">Falta capa — edite no painel.</p>';
  }

  return (
    '<div class="game-card">' +
    '<div class="game-card-title">' + escapeHtml(item.title) + "</div>" +
    '<div class="game-card-meta">' + escapeHtml(item.file.name) + " · " + fmtBytes(item.file.size) + "</div>" +
    statusBadge +
    extra +
    '<div class="game-card-actions">' +
    '<button type="button" class="btn--danger" data-remove="' + item.id + '">Remover</button>' +
    "</div></div>"
  );
}

function fmtBytes(n) {
  if (n > 1024 * 1024) return (n / 1024 / 1024).toFixed(1) + "MB";
  return Math.round(n / 1024) + "KB";
}

function render() {
  const list = document.getElementById("import-list");
  const summary = document.getElementById("import-summary");
  const counts = document.getElementById("import-counts");
  const all = Array.from(items.values());

  list.innerHTML = all.map(itemCard).join("");

  if (!all.length) {
    summary.hidden = true;
    return;
  }

  const ready = all.filter((it) => it.status === "ready").length;
  const working = all.filter((it) => ["pending", "hashing", "checking", "uploading", "committing"].includes(it.status)).length;
  const warn = all.filter((it) => it.status === "needs-platform").length;
  const dup = all.filter((it) => it.status === "duplicate").length;
  const err = all.filter((it) => it.status === "error").length;

  summary.hidden = false;
  counts.textContent =
    all.length + " arquivo(s) — " +
    ready + " pronto(s) · " +
    working + " em andamento · " +
    warn + " precisam de plataforma · " +
    dup + " duplicado(s) · " +
    err + " com erro";
}

// -------------------------------------------------------------------------
// eventos
// -------------------------------------------------------------------------

const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("import-files");
const rightsCheckbox = document.getElementById("import-rights");
const errorEl = document.getElementById("import-error");

function guardedAddFiles(fileList) {
  errorEl.hidden = true;
  if (!BLOB_READY) {
    errorEl.textContent = "Upload em lote indisponível — Vercel Blob não configurado neste ambiente.";
    errorEl.hidden = false;
    return;
  }
  if (!rightsCheckbox.checked) {
    errorEl.textContent = "Confirme o checkbox de direitos autorais antes de selecionar arquivos.";
    errorEl.hidden = false;
    return;
  }
  addFiles(fileList);
}

if (fileInput) {
  fileInput.addEventListener("change", () => {
    guardedAddFiles(fileInput.files);
    fileInput.value = "";
  });
}

if (dropzone) {
  ["dragenter", "dragover"].forEach((evt) =>
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.add("dropzone--active");
    })
  );
  ["dragleave", "drop"].forEach((evt) =>
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.remove("dropzone--active");
    })
  );
  dropzone.addEventListener("drop", (e) => {
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
      guardedAddFiles(e.dataTransfer.files);
    }
  });
}

document.getElementById("import-list").addEventListener("click", (e) => {
  const retryBtn = e.target.closest("[data-retry]");
  if (retryBtn) return retry(retryBtn.dataset.retry);

  const removeBtn = e.target.closest("[data-remove]");
  if (removeBtn) return removeItem(removeBtn.dataset.remove);

  const confirmBtn = e.target.closest("[data-confirm-platform]");
  if (confirmBtn) {
    const select = document.querySelector('[data-platform-select="' + confirmBtn.dataset.confirmPlatform + '"]');
    return confirmPlatform(confirmBtn.dataset.confirmPlatform, select && select.value);
  }
});
