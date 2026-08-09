/* Jogos adicionados pelo admin (upload de ROM), guardados à parte do
 * config/keychains.json — esse arquivo é estático (versionado no repo) e não
 * dá pra escrever nele em produção: o filesystem da Vercel é só leitura fora
 * de /tmp, e mesmo que desse, cada instância serverless tem sua própria
 * cópia — uma escrita numa não apareceria nas outras.
 *
 * Mesmo padrão de lib/store.js: Redis (Vercel KV/Upstash) quando configurado,
 * memória em dev local. `server.js` funde isto com config/keychains.json em
 * loadKeychains().
 */

const { durable, redis } = require("./redis");

const KEY_PREFIX = "myde:game:";
const INDEX_KEY = "myde:games";

const memory = new Map();

const memoryStore = {
  async get(id) {
    return memory.get(id) || null;
  },
  async put(game) {
    memory.set(game.gameId, game);
    return game;
  },
  async remove(id) {
    memory.delete(id);
  },
  async list() {
    return Array.from(memory.values());
  },
};

const redisStore = {
  async get(id) {
    const raw = await redis(["GET", KEY_PREFIX + id]);
    if (!raw) return null;
    try {
      return typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch (e) {
      return null;
    }
  },
  async put(game) {
    await redis(["SET", KEY_PREFIX + game.gameId, JSON.stringify(game)]);
    await redis(["SADD", INDEX_KEY, game.gameId]);
    return game;
  },
  async remove(id) {
    await redis(["DEL", KEY_PREFIX + id]);
    await redis(["SREM", INDEX_KEY, id]);
  },
  async list() {
    const ids = (await redis(["SMEMBERS", INDEX_KEY])) || [];
    if (!ids.length) return [];
    const rows = await Promise.all(ids.map((id) => this.get(id)));
    return rows.filter(Boolean);
  },
};

const store = durable ? redisStore : memoryStore;

module.exports = {
  durable,
  get: (id) => store.get(id),
  put: (game) => store.put(game),
  remove: (id) => store.remove(id),
  list: () => store.list(),
};
