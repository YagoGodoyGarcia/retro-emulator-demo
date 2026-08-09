/* Fonte única de verdade sobre plataformas suportadas.
 *
 * `id` é literalmente o valor de EJS_core (a chave de "system" que o
 * EmulatorJS espera) — não é um slug nosso. Confirmado direto na fonte
 * oficial (cdn.emulatorjs.org/stable/data/src/emulator.js, método
 * getCores()) e na documentação por sistema
 * (github.com/EmulatorJS/emulatorjs.org/content/1.docs/8.systems/*.md) em
 * 2026-08-09 — não inventamos core nem suporte que a versão stable não
 * documenta (pedido explícito do briefing).
 *
 * `enabled: true` significa "tecnicamente cabeado" (core existe, extensão
 * mapeada, BIOS documentada quando aplicável) — NÃO significa "tem jogo".
 * A home e a folha "ver todos" já escondem plataforma sem nenhum jogo
 * cadastrado (lógica em public/js/library.js e no filtro de coresPresent em
 * server.js), então ativar uma plataforma aqui não bota nada na tela
 * sozinho — só destrava a opção pro admin cadastrar, SE algum dia tiver um
 * arquivo homebrew/de domínio público/próprio pra ela. Nós não buscamos
 * ROM nenhuma pra nenhuma plataforma, comercial ou não.
 *
 * `coreOptions` é informativo por enquanto (seção 5 do briefing) — o
 * primeiro item é o que o EmulatorJS usa por padrão pra aquele "system"
 * quando só EJS_core é setado (sem force de core específico). Ainda não
 * existe seleção de core alternativo nem fallback automático nesta versão
 * (Fase 2 do registro, não implementado ainda).
 *
 * `priority` é só editorial (aparece na matriz da auditoria) — 1 é o que já
 * está em produção, número maior é mais periférico/exige mais trabalho
 * (BIOS, disco múltiplo) antes de valer a pena.
 */

function platform(p) {
  return Object.assign(
    {
      slug: p.id,
      core: p.id,
      manufacturer: null,
      generation: null,
      regionSupport: ["USA", "Europe", "Japan", "World"],
      archiveExtensions: [],
      requiresBios: false,
      biosFiles: [],
      multiFile: false,
      discBased: false,
      // Cartucho pequeno cabe folgado; disco/archive fica sob o mesmo teto
      // dos outros porque o upload direto pro Blob (Fase 4) ainda não fala
      // multipart — arquivo de CD/DVD de verdade (200MB-4GB+) não é
      // realista nesse mecanismo hoje, então não finge que já suporta.
      maxRomBytes: 8 * 1024 * 1024,
      mobileSupport: true,
      desktopSupport: true,
      enabled: true,
      engine: "emulatorjs",
    },
    p,
    { coreFile: p.coreOptions[0] }
  );
}

const PLATFORMS = [
  // ---- Em produção hoje (prioridade 1) --------------------------------
  platform({
    id: "nes", name: "Nintendo Entertainment System / Famicom", manufacturer: "Nintendo", generation: 3,
    coreOptions: ["fceumm", "nestopia"], extensions: [".nes"], maxRomBytes: 1 * 1024 * 1024,
    style: { from: "#8b5cf6", to: "#2e1065", accent: "#c4b5fd" }, order: 1, priority: 1,
  }),
  platform({
    id: "snes", name: "Super Nintendo Entertainment System / Super Famicom", manufacturer: "Nintendo", generation: 4,
    coreOptions: ["snes9x"], extensions: [".sfc", ".smc"],
    style: { from: "#14b8a6", to: "#0f3d38", accent: "#5eead4" }, order: 2, priority: 1,
  }),
  platform({
    id: "gba", name: "Game Boy Advance", manufacturer: "Nintendo", generation: 6,
    coreOptions: ["mgba"], extensions: [".gba"], maxRomBytes: 32 * 1024 * 1024,
    style: { from: "#f59e0b", to: "#7c2d12", accent: "#fcd34d" }, order: 3, priority: 1,
  }),
  platform({
    id: "segaMD", name: "Sega Mega Drive / Genesis", manufacturer: "Sega", generation: 4,
    coreOptions: ["genesis_plus_gx", "picodrive"], extensions: [".bin", ".md", ".gen", ".smd"],
    style: { from: "#3b82f6", to: "#1e1b4b", accent: "#93c5fd" }, order: 4, priority: 1,
  }),

  // ---- Sem BIOS, cartucho único — prontas pra ativar com homebrew (prioridade 2) ----
  platform({
    id: "gb", name: "Game Boy / Game Boy Color", manufacturer: "Nintendo", generation: 4,
    // EmulatorJS não tem "system" separado pra Game Boy Color — gambatte
    // trata os dois. Duas entradas (gb/gbc) inventariam um core que a
    // versão stable não tem; por isso é uma entrada só, com as duas
    // extensões.
    coreOptions: ["gambatte", "mgba"], extensions: [".gb", ".gbc"],
    style: { from: "#22c55e", to: "#052e13", accent: "#86efac" }, order: 5, priority: 2,
  }),
  platform({
    id: "segaMS", name: "Sega Master System", manufacturer: "Sega", generation: 3,
    coreOptions: ["smsplus", "genesis_plus_gx", "picodrive"], extensions: [".sms"],
    style: { from: "#0ea5e9", to: "#0c2f4a", accent: "#7dd3fc" }, order: 6, priority: 2,
  }),
  platform({
    id: "segaGG", name: "Sega Game Gear", manufacturer: "Sega", generation: 4,
    coreOptions: ["genesis_plus_gx"], extensions: [".gg"],
    style: { from: "#06b6d4", to: "#083344", accent: "#67e8f9" }, order: 7, priority: 2,
  }),
  platform({
    id: "atari2600", name: "Atari 2600", manufacturer: "Atari", generation: 2,
    coreOptions: ["stella2014"], extensions: [".a26", ".bin"],
    style: { from: "#dc2626", to: "#450a0a", accent: "#fca5a5" }, order: 8, priority: 2,
  }),
  platform({
    id: "atari7800", name: "Atari 7800", manufacturer: "Atari", generation: 3,
    coreOptions: ["prosystem"], extensions: [".a78", ".bin"],
    style: { from: "#ea580c", to: "#431407", accent: "#fdba74" }, order: 9, priority: 2,
  }),
  platform({
    id: "pce", name: "PC Engine / TurboGrafx-16", manufacturer: "NEC", generation: 4,
    coreOptions: ["mednafen_pce"], extensions: [".pce"],
    style: { from: "#e11d48", to: "#4c0519", accent: "#fda4af" }, order: 10, priority: 2,
  }),
  platform({
    id: "ngp", name: "Neo Geo Pocket / Color", manufacturer: "SNK", generation: 5,
    coreOptions: ["mednafen_ngp"], extensions: [".ngp", ".ngc"],
    style: { from: "#65a30d", to: "#1a2e05", accent: "#bef264" }, order: 11, priority: 2,
  }),
  platform({
    id: "ws", name: "WonderSwan / Color", manufacturer: "Bandai", generation: 5,
    coreOptions: ["mednafen_wswan"], extensions: [".ws", ".wsc"],
    style: { from: "#7c3aed", to: "#1e1033", accent: "#c4b5fd" }, order: 12, priority: 2,
  }),
  platform({
    id: "coleco", name: "ColecoVision", manufacturer: "Coleco", generation: 2,
    coreOptions: ["gearcoleco"], extensions: [".col", ".rom"],
    style: { from: "#78716c", to: "#1c1917", accent: "#d6d3d1" }, order: 13, priority: 2,
  }),
  platform({
    id: "lynx", name: "Atari Lynx", manufacturer: "Atari", generation: 4,
    coreOptions: ["handy"], extensions: [".lnx"],
    style: { from: "#f43f5e", to: "#4c0519", accent: "#fda4af" }, order: 14, priority: 2,
  }),
  platform({
    id: "atari5200", name: "Atari 5200", manufacturer: "Atari", generation: 2,
    coreOptions: ["a5200"], extensions: [".a52", ".bin"],
    style: { from: "#b91c1c", to: "#450a0a", accent: "#fca5a5" }, order: 15, priority: 3,
  }),
  platform({
    id: "vb", name: "Virtual Boy", manufacturer: "Nintendo", generation: 5,
    coreOptions: ["beetle_vb"], extensions: [".vb"],
    style: { from: "#dc2626", to: "#1c1917", accent: "#f87171" }, order: 16, priority: 3,
  }),
  platform({
    id: "jaguar", name: "Atari Jaguar", manufacturer: "Atari", generation: 5,
    coreOptions: ["virtualjaguar"], extensions: [".j64", ".jag"],
    style: { from: "#991b1b", to: "#1c1917", accent: "#fca5a5" }, order: 17, priority: 3,
  }),
  platform({
    id: "n64", name: "Nintendo 64", manufacturer: "Nintendo", generation: 5,
    coreOptions: ["mupen64plus_next", "parallel_n64"], extensions: [".n64", ".z64", ".v64"],
    maxRomBytes: 64 * 1024 * 1024,
    // Doc oficial: "On iOS mobile, n64 will default to parallel-n64" — os
    // dois cores rodam em mobile, mas com ressalva de performance real
    // (seção 16 do briefing pede teste específico em iOS antes de confiar).
    mobileSupport: true, desktopSupport: true,
    style: { from: "#059669", to: "#022c22", accent: "#6ee7b7" }, order: 18, priority: 2,
  }),

  // ---- Arcade — romset costuma vir em .zip, tratado como archive -------
  platform({
    id: "arcade", name: "Arcade (FinalBurn Neo / CPS1 / CPS2)", manufacturer: "Diversos", generation: null,
    coreOptions: ["fbneo", "fbalpha2012_cps1", "fbalpha2012_cps2"],
    // O romset inteiro é o "arquivo" aqui — .zip entra em extensions (não só
    // archiveExtensions) pra validação de upload aceitar de verdade; a
    // inspeção do conteúdo do zip (seção 42/43 do briefing) não está feita.
    // 80MB (não 64MB) pra dar folga a romset maior sem fingir suportar
    // upload multipart de verdade (o direto-pro-Blob ainda é single-shot).
    extensions: [".zip"], archiveExtensions: [".zip"], multiFile: true, maxRomBytes: 80 * 1024 * 1024,
    style: { from: "#facc15", to: "#422006", accent: "#fde047" }, order: 19, priority: 3,
  }),
  platform({
    id: "mame", name: "MAME 2003", manufacturer: "Diversos", generation: null,
    coreOptions: ["mame2003_plus", "mame2003"],
    extensions: [".zip"], archiveExtensions: [".zip"], multiFile: true, maxRomBytes: 80 * 1024 * 1024,
    style: { from: "#eab308", to: "#422006", accent: "#fde047" }, order: 20, priority: 3,
  }),

  // ---- Exige BIOS e/ou é baseado em disco — prioridade 3 (mais trabalho antes de valer) ----
  platform({
    id: "segaCD", name: "Sega CD / Mega-CD", manufacturer: "Sega", generation: 4,
    coreOptions: ["genesis_plus_gx", "genesis_plus_gx_wide", "picodrive"],
    // Doc oficial diz "I do not know the file extension limits for this
    // system" — mantém os formatos de disco padrão, sem inventar precisão
    // que nem o próprio EmulatorJS declara ter.
    extensions: [".cue", ".iso", ".chd"], discBased: true, multiFile: true, maxRomBytes: 64 * 1024 * 1024,
    requiresBios: true, biosFiles: ["bios_CD_U.bin", "bios_CD_E.bin", "bios_CD_J.bin"],
    style: { from: "#2563eb", to: "#0d1a3d", accent: "#93c5fd" }, order: 21, priority: 3,
  }),
  platform({
    id: "sega32x", name: "Sega 32X", manufacturer: "Sega", generation: 4,
    coreOptions: ["picodrive"], extensions: [".32x", ".bin"],
    style: { from: "#1d4ed8", to: "#0d1a3d", accent: "#93c5fd" }, order: 22, priority: 3,
  }),
  platform({
    id: "segaSaturn", name: "Sega Saturn", manufacturer: "Sega", generation: 5,
    coreOptions: ["yabause"], extensions: [".cue", ".iso", ".chd"], discBased: true, multiFile: true,
    maxRomBytes: 64 * 1024 * 1024, requiresBios: true, biosFiles: ["saturn_bios.bin"],
    style: { from: "#4338ca", to: "#1e1b4b", accent: "#a5b4fc" }, order: 23, priority: 3,
  }),
  platform({
    id: "psx", name: "Sony PlayStation", manufacturer: "Sony", generation: 5,
    coreOptions: ["pcsx_rearmed", "mednafen_psx_hw"],
    extensions: [".cue", ".bin", ".iso", ".chd", ".pbp", ".m3u"], discBased: true, multiFile: true,
    maxRomBytes: 64 * 1024 * 1024, requiresBios: true, biosFiles: ["scph5500.bin", "scph5501.bin", "scph5502.bin"],
    style: { from: "#1e3a8a", to: "#0a0f2c", accent: "#93c5fd" }, order: 24, priority: 3,
  }),
  platform({
    id: "3do", name: "3DO Interactive Multiplayer", manufacturer: "Panasonic/3DO", generation: 5,
    coreOptions: ["opera"], extensions: [".iso", ".cue", ".chd"], discBased: true, multiFile: true,
    maxRomBytes: 64 * 1024 * 1024, requiresBios: true,
    biosFiles: ["panafz1.bin", "panafz10.bin", "goldstar.bin", "sanyotry.bin"],
    style: { from: "#57534e", to: "#1c1917", accent: "#d6d3d1" }, order: 25, priority: 4,
  }),
  platform({
    id: "nds", name: "Nintendo DS", manufacturer: "Nintendo", generation: 7,
    coreOptions: ["melonds", "desmume", "desmume2015"], extensions: [".nds"], maxRomBytes: 32 * 1024 * 1024,
    // BIOS só é exigida pelo core melonds (o padrão); desmume/desmume2015
    // rodam sem — por isso requiresBios fica true (reflete o default) mas
    // não é absoluto pros três cores.
    requiresBios: true,
    biosFiles: ["bios7.bin", "bios9.bin", "firmware.bin"],
    mobileSupport: true, desktopSupport: true,
    style: { from: "#374151", to: "#030712", accent: "#d1d5db" }, order: 26, priority: 4,
  }),
  platform({
    id: "pcfx", name: "PC-FX", manufacturer: "NEC", generation: 5,
    coreOptions: ["mednafen_pcfx"], extensions: [".cue", ".iso"], discBased: true, maxRomBytes: 64 * 1024 * 1024,
    style: { from: "#be185d", to: "#500724", accent: "#f9a8d4" }, order: 27, priority: 4,
  }),

  // ---- PSP: precisa de threads (SharedArrayBuffer/COOP-COEP), hoje não configurado ----
  platform({
    id: "psp", name: "PlayStation Portable", manufacturer: "Sony", generation: 7,
    coreOptions: ["ppsspp"], extensions: [".iso", ".cso", ".pbp"], discBased: true, maxRomBytes: 64 * 1024 * 1024,
    // Doc oficial: "This core requires that EJS_threads = true". O projeto
    // não liga EJS_threads hoje (precisa de Cross-Origin-Opener-Policy +
    // Cross-Origin-Embedder-Policy no vercel.json, não configurado) — fica
    // registrado mas sem premissa de já funcionar sem esse passo extra.
    mobileSupport: false, desktopSupport: true,
    style: { from: "#0f172a", to: "#000000", accent: "#94a3b8" }, order: 28, priority: 4,
  }),

  // ---- Computadores de 8/16-bit — geração não se aplica do mesmo jeito ----
  platform({
    id: "c64", name: "Commodore 64", manufacturer: "Commodore", generation: null,
    coreOptions: ["vice_x64sc"], extensions: [".d64", ".prg", ".t64"],
    style: { from: "#7c2d12", to: "#1c0a00", accent: "#fdba74" }, order: 29, priority: 4,
  }),
  platform({
    id: "c128", name: "Commodore 128", manufacturer: "Commodore", generation: null,
    coreOptions: ["vice_x128"], extensions: [".d64", ".prg"],
    style: { from: "#7c2d12", to: "#1c0a00", accent: "#fdba74" }, order: 30, priority: 4,
  }),
  platform({
    id: "vic20", name: "Commodore VIC-20", manufacturer: "Commodore", generation: null,
    coreOptions: ["vice_xvic"], extensions: [".d64", ".prg"],
    style: { from: "#92400e", to: "#1c0a00", accent: "#fdba74" }, order: 31, priority: 4,
  }),
  platform({
    id: "plus4", name: "Commodore Plus/4", manufacturer: "Commodore", generation: null,
    coreOptions: ["vice_xplus4"], extensions: [".d64", ".prg"],
    style: { from: "#92400e", to: "#1c0a00", accent: "#fdba74" }, order: 32, priority: 4,
  }),
  platform({
    id: "pet", name: "Commodore PET", manufacturer: "Commodore", generation: null,
    coreOptions: ["vice_xpet"], extensions: [".prg"],
    style: { from: "#57534e", to: "#1c1917", accent: "#d6d3d1" }, order: 33, priority: 4,
  }),
  platform({
    id: "amiga", name: "Commodore Amiga", manufacturer: "Commodore", generation: null,
    coreOptions: ["puae"], extensions: [".adf", ".lha"], multiFile: true,
    // Kickstart ROM da Amiga é ela mesma protegida por copyright — mesma
    // regra de sempre, admin só configura se tiver o direito de usar a sua.
    requiresBios: true, biosFiles: ["kick34005.A500"],
    style: { from: "#374151", to: "#030712", accent: "#d1d5db" }, order: 34, priority: 4,
  }),
  platform({
    id: "dos", name: "MS-DOS", manufacturer: "Diversos", generation: null,
    coreOptions: ["dosbox_pure"], extensions: [".zip"], archiveExtensions: [".zip"], multiFile: true,
    maxRomBytes: 80 * 1024 * 1024,
    style: { from: "#1e293b", to: "#020617", accent: "#94a3b8" }, order: 35, priority: 4,
  }),
];

const DEFAULT_STYLE = { label: "RETRO", from: "#64748b", to: "#1e293b", accent: "#cbd5e1" };

// Nome curto de exibição (badge/chip/<option>) — separado do `name` (nome
// completo) do registro. Vive junto da definição de cada plataforma pra não
// virar mais uma lista solta que desalinha; qualquer id sem entrada aqui
// cai pro próprio `name` completo.
const SHORT_LABEL = {
  nes: "NES", snes: "SNES", gba: "GBA", segaMD: "MEGA DRIVE",
  gb: "GAME BOY", segaMS: "MASTER SYSTEM", segaGG: "GAME GEAR",
  atari2600: "ATARI 2600", atari7800: "ATARI 7800", pce: "PC ENGINE",
  ngp: "NEO GEO POCKET", ws: "WONDERSWAN", coleco: "COLECOVISION",
  lynx: "ATARI LYNX", atari5200: "ATARI 5200", vb: "VIRTUAL BOY",
  jaguar: "ATARI JAGUAR", n64: "N64", arcade: "ARCADE", mame: "MAME",
  segaCD: "SEGA CD", sega32x: "SEGA 32X", segaSaturn: "SATURN",
  psx: "PLAYSTATION", "3do": "3DO", nds: "NINTENDO DS", pcfx: "PC-FX",
  psp: "PSP", c64: "COMMODORE 64", c128: "COMMODORE 128",
  vic20: "VIC-20", plus4: "PLUS/4", pet: "COMMODORE PET",
  amiga: "AMIGA", dos: "MS-DOS",
};
PLATFORMS.forEach((p) => { p.label = SHORT_LABEL[p.id] || p.name; });

const byId = new Map(PLATFORMS.map((p) => [p.id, p]));

function list() {
  return PLATFORMS.filter((p) => p.enabled).slice().sort((a, b) => a.order - b.order);
}

function get(id) {
  return byId.get(id) || null;
}

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

// "arquivo.gen" -> "segaMD". Só um sinal — extensão pode estar errada, e
// com 35 plataformas várias dividem a mesma extensão de propósito
// ambíguo (".bin" sozinho hoje bate com segaMD, atari2600, atari7800,
// atari5200 e sega32x). Nesse caso NÃO escolhe um vencedor arbitrário —
// devolve null (seção 15 do briefing: "nunca publicar automaticamente
// algo cuja plataforma não esteja validada"), quem chama pede confirmação
// manual. Disco (.cue/.iso/.chd) e archive (.zip) nunca detectam sozinhos
// pelo mesmo motivo, ainda mais óbvio (seção 7: eles não determinam
// plataforma sozinhos, quase todo sistema de disco usa os mesmos 3-4
// formatos).
function detectByFilename(filename) {
  const dot = String(filename || "").lastIndexOf(".");
  const ext = dot === -1 ? "" : String(filename).slice(dot).toLowerCase();
  if (!ext) return null;
  const candidates = list().filter(
    (p) => p.extensions.includes(ext) && !p.discBased && p.archiveExtensions.length === 0
  );
  return candidates.length === 1 ? candidates[0].id : null;
}

// Só os ids habilitados hoje entram na lista de "consoles válidos" (usado
// pro <select> do admin e validação de extensão) — mesma fonte, sem
// Object.keys solto que pegaria variantes de controle como "segaMD6".
const CORES = list().map((p) => p.id);

module.exports = {
  list,
  get,
  styleOf,
  coreFileOf,
  extensionsOf,
  detectByFilename,
  CORES,
  DEFAULT_STYLE,
};
