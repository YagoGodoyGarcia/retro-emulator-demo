/* Fachada única de leitura da biblioteca — o resto do app (rotas, player,
 * busca) não precisa saber se um jogo veio do config/keychains.json
 * (estático, versionado no repo) ou do admin/Redis (dinâmico). Os dois
 * passam por normalizeGame() e viram o mesmo formato; substitui o
 * loadKeychains() que antes vivia dentro de server.js.
 *
 * Não migra o armazenamento — config/keychains.json e lib/library-store.js
 * continuam sendo as duas fontes reais. Isso só junta e normaliza.
 */

const platforms = require("./platforms");
const libraryStore = require("./library-store");
const keychainsConfig = require("../config/keychains.json");

/**
 * Formato canônico de jogo. Campos que um jogo antigo (estático ou já
 * cadastrado antes desta mudança) não tem ganham default de compatibilidade
 * — nenhum jogo existente muda de comportamento por causa disso.
 */
function normalizeGame(raw, source) {
  return {
    gameId: raw.gameId,
    title: raw.title,
    core: raw.core,
    platform: raw.core, // hoje platform === core (1 engine só, ver lib/platforms.js)
    engine: (platforms.get(raw.core) || {}).engine || "emulatorjs",
    gameUrl: raw.gameUrl,
    cover: raw.cover,
    genre: raw.genre || "",
    tags: raw.tags || [],
    featured: Boolean(raw.featured),
    skipIntro: raw.skipIntro !== false,
    gamepad: raw.gamepad || null,
    // Jogo que já existia antes do conceito de status é sempre "published"
    // — não pode um jogo ao vivo virar rascunho sozinho numa migração.
    status: raw.status || "published",
    source: raw.source || source,
    addedAt: raw.addedAt || null,
    rom: {
      filename: raw.romFilename || null,
      size: raw.romSize || null,
      hash: raw.romHash || null,
    },
  };
}

/**
 * Todo jogo, normalizado, estático + dinâmico mesclados (dinâmico ganha em
 * caso de mesmo gameId — mesma regra de sempre). Retorna array; quem
 * precisa indexar por id usa getGame().
 */
async function getAllGames() {
  const parsed = { ...keychainsConfig };
  delete parsed._comment;

  const games = new Map();

  for (const [keyId, cfg] of Object.entries(parsed)) {
    // Override por env var, ex: GAMEURL_FLAPPYBIRD_NES=https://.../outra.nes
    const envKey = `GAMEURL_${keyId.toUpperCase().replace(/[^A-Z0-9]/g, "_")}`;
    const gameId = cfg.gameId || keyId;
    games.set(
      gameId,
      normalizeGame({ ...cfg, gameId, gameUrl: process.env[envKey] || cfg.gameUrl }, "static")
    );
  }

  let uploaded = [];
  try {
    uploaded = await libraryStore.list();
  } catch (err) {
    console.error("[library] falha ao listar jogos do admin:", err.message);
  }
  for (const cfg of uploaded) {
    games.set(cfg.gameId, normalizeGame(cfg, "dynamic"));
  }

  return [...games.values()];
}

async function getGame(gameId) {
  const games = await getAllGames();
  return games.find((g) => g.gameId === gameId) || null;
}

async function getGamesByPlatform(platformId) {
  const games = await getAllGames();
  return games.filter((g) => g.platform === platformId);
}

function getPlatforms() {
  return platforms.list();
}

module.exports = {
  normalizeGame,
  getAllGames,
  getGame,
  getGamesByPlatform,
  getPlatforms,
};
