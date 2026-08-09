/* Contagem de jogadas por jogo — histórico de localStorage em library.js já
 * alimenta a "sugestão", mas é por aparelho, não dá pra ordenar a home
 * "mais jogados" com isso (cada visitante só vê o próprio). Isso aqui é o
 * contador agregado, incrementado toda vez que /play/:id carrega de
 * verdade (ver server.js).
 *
 * Mesmo padrão de lib/store.js e lib/library-store.js: Redis quando
 * configurado, memória em dev local.
 */

const { durable, redis } = require("./redis");

const KEY_PREFIX = "myde:plays:";
const memory = new Map();

async function increment(gameId) {
  if (!gameId) return;
  if (durable) {
    await redis(["INCR", KEY_PREFIX + gameId]);
    return;
  }
  memory.set(gameId, (memory.get(gameId) || 0) + 1);
}

/**
 * Devolve { gameId: contagem } pros ids pedidos. Um MGET só (não um GET por
 * jogo) — importa numa lista de ~50-100 jogos renderizada a cada carga da
 * home.
 */
async function getCounts(gameIds) {
  if (!gameIds.length) return {};
  if (!durable) {
    const out = {};
    gameIds.forEach((id) => { out[id] = memory.get(id) || 0; });
    return out;
  }
  const keys = gameIds.map((id) => KEY_PREFIX + id);
  const values = await redis(["MGET", ...keys]);
  const out = {};
  gameIds.forEach((id, i) => { out[id] = parseInt(values[i], 10) || 0; });
  return out;
}

module.exports = { increment, getCounts };
