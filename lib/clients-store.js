/* Armazenamento das contas de cliente (login sem senha, gerado pelo admin).
 * Mesmo padrão de lib/store.js (tokens de convite): Redis quando configurado,
 * memória como fallback só pra dev local.
 */

const { durable, redis } = require("./redis");

const KEY_PREFIX = "myde:client:";
const INDEX_KEY = "myde:clients";

const memory = new Map();

const memoryStore = {
  async get(id) {
    return memory.get(id) || null;
  },
  async put(client) {
    memory.set(client.id, client);
    return client;
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
  async put(client) {
    await redis(["SET", KEY_PREFIX + client.id, JSON.stringify(client)]);
    await redis(["SADD", INDEX_KEY, client.id]);
    return client;
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
  put: (client) => store.put(client),
  remove: (id) => store.remove(id),
  list: () => store.list(),
};
