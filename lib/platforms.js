/* Fonte única de verdade sobre plataformas suportadas.
 *
 * Antes disso a mesma informação vivia espalhada e podia desalinhar sem
 * ninguém perceber: CORE_STYLE e CORE_FILE em server.js, CORE_EXTENSIONS em
 * lib/game-entry.js, a lista de cores hardcoded em lib/gamepad.js. Upload,
 * validação, filtro, admin e player agora leem daqui.
 *
 * `engine` fica separado de `core` de propósito: hoje só existe o engine
 * "emulatorjs", mas um dia pode existir "play" (PS1/PS2) rodando ao lado sem
 * misturar os dois conceitos (plataforma != engine != core do libretro).
 */

const PLATFORMS = [
  {
    id: "nes",
    label: "NES",
    order: 1,
    engine: "emulatorjs",
    core: "nes",
    extensions: [".nes"],
    coreFile: "fceumm",
    style: { from: "#8b5cf6", to: "#2e1065", accent: "#c4b5fd" },
  },
  {
    id: "snes",
    label: "SNES",
    order: 2,
    engine: "emulatorjs",
    core: "snes",
    extensions: [".sfc", ".smc"],
    coreFile: "snes9x",
    style: { from: "#14b8a6", to: "#0f3d38", accent: "#5eead4" },
  },
  {
    id: "gba",
    label: "GBA",
    order: 3,
    engine: "emulatorjs",
    core: "gba",
    extensions: [".gba"],
    coreFile: "mgba",
    style: { from: "#f59e0b", to: "#7c2d12", accent: "#fcd34d" },
  },
  {
    id: "segaMD",
    label: "MEGA DRIVE",
    order: 4,
    engine: "emulatorjs",
    core: "segaMD",
    extensions: [".bin", ".md", ".gen"],
    coreFile: "genesis_plus_gx",
    style: { from: "#3b82f6", to: "#1e1b4b", accent: "#93c5fd" },
  },
];

const DEFAULT_STYLE = { label: "RETRO", from: "#64748b", to: "#1e293b", accent: "#cbd5e1" };

const byId = new Map(PLATFORMS.map((p) => [p.id, p]));

function list() {
  return PLATFORMS.slice().sort((a, b) => a.order - b.order);
}

function get(id) {
  return byId.get(id) || null;
}

// Mantém o formato antigo de CORE_STYLE (label/from/to/accent no mesmo
// nível) pra quem já lia assim não precisar mudar.
function styleOf(id) {
  const p = byId.get(id);
  return p ? { label: p.label, ...p.style } : DEFAULT_STYLE;
}

function coreFileOf(id) {
  const p = byId.get(id);
  return p ? p.coreFile : null;
}

function extensionsOf(id) {
  const p = byId.get(id);
  return p ? p.extensions : [];
}

// "arquivo.gen" -> "segaMD": primeira plataforma cuja lista de extensões
// bate. Só um sinal — extensão pode estar errada, quem chama decide se
// confia direto ou pede confirmação (ver README/seção 15 do briefing).
function detectByFilename(filename) {
  const dot = String(filename || "").lastIndexOf(".");
  const ext = dot === -1 ? "" : String(filename).slice(dot).toLowerCase();
  const platform = PLATFORMS.find((p) => p.extensions.includes(ext));
  return platform ? platform.id : null;
}

const CORES = PLATFORMS.map((p) => p.id);

module.exports = { list, get, styleOf, coreFileOf, extensionsOf, detectByFilename, CORES, DEFAULT_STYLE };
