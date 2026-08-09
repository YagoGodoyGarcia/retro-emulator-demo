/* Jogos adicionados pelo admin (upload de ROM), guardados à parte do
 * config/keychains.json — esse arquivo é estático (versionado no repo) e não
 * dá pra escrever nele em produção: o filesystem da Vercel é só leitura fora
 * de /tmp, e mesmo que desse, cada instância serverless tem sua própria
 * cópia — uma escrita numa não apareceria nas outras.
 *
 * Mesmo padrão de lib/store.js: Redis (Vercel KV/Upstash) quando configurado,
 * memória em dev local. lib/library-service.js funde isto com
 * config/keychains.json.
 *
 * Também mantém um índice por hash de ROM (game.romHash -> gameId) pra
 * detecção de duplicata (seções 16/54 do briefing) — nome de arquivo não é
 * critério confiável, o mesmo jogo baixado de fontes diferentes pode ter
 * nomes completamente diferentes.
 */

const { durable, redis } = require("./redis");

const KEY_PREFIX = "myde:game:";
const INDEX_KEY = "myde:games";
const HASH_PREFIX = "myde:romhash:";

const memory = new Map();
const memoryHashIndex = new Map();

const memoryStore = {
  async get(id) {
    return memory.get(id) || null;
  },
  async put(game) {
    memory.set(game.gameId, game);
    if (game.romHash) memoryHashIndex.set(game.romHash, game.gameId);
    return game;
  },
  async remove(id) {
    const existing = memory.get(id);
    if (existing && existing.romHash) memoryHashIndex.delete(existing.romHash);
    memory.delete(id);
  },
  async list() {
    return Array.from(memory.values());
  },
  async findByHash(hash) {
    const id = memoryHashIndex.get(hash);
    return id ? memory.get(id) || null : null;
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
    if (game.romHash) await redis(["SET", HASH_PREFIX + game.romHash, game.gameId]);
    return game;
  },
  async remove(id) {
    // Busca antes de apagar: precisa do romHash pra também limpar o índice
    // de duplicata, senão ele fica apontando pra um gameId que não existe
    // mais.
    const existing = await this.get(id);
    await redis(["DEL", KEY_PREFIX + id]);
    await redis(["SREM", INDEX_KEY, id]);
    if (existing && existing.romHash) await redis(["DEL", HASH_PREFIX + existing.romHash]);
  },
  async list() {
    const ids = (await redis(["SMEMBERS", INDEX_KEY])) || [];
    if (!ids.length) return [];
    const rows = await Promise.all(ids.map((id) => this.get(id)));
    return rows.filter(Boolean);
  },
  async findByHash(hash) {
    const id = await redis(["GET", HASH_PREFIX + hash]);
    return id ? this.get(id) : null;
  },
};

const store = durable ? redisStore : memoryStore;

module.exports = {
  durable,
  get: (id) => store.get(id),
  put: (game) => store.put(game),
  remove: (id) => store.remove(id),
  list: () => store.list(),
  findByHash: (hash) => store.findByHash(hash),
};
