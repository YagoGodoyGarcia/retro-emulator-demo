/* Posse de jogos por carteira. Um mesmo jogo pode ser atribuído a várias
 * contas-clientes (cada pessoa recebe uma cópia lógica do cartucho), enquanto
 * `setOwner` mantém o comportamento legado de posse exclusiva usado pelo
 * painel administrativo antigo.
 */

const { durable, redis } = require("./redis");

const OWNER_PREFIX = "myde:owner:"; // compatibilidade: gameId -> primeiro clientId
const OWNERS_PREFIX = "myde:owners:"; // gameId -> Set(clientId)
const CLIENT_GAMES_PREFIX = "myde:client-games:"; // clientId -> Set(gameId)

const memoryOwner = new Map();
const memoryGameOwners = new Map();
const memoryClientGames = new Map();

function addMemoryClientGame(clientId, gameId) {
  if (!memoryClientGames.has(clientId)) memoryClientGames.set(clientId, new Set());
  memoryClientGames.get(clientId).add(gameId);
}

function removeMemoryClientGame(clientId, gameId) {
  const set = memoryClientGames.get(clientId);
  if (!set) return;
  set.delete(gameId);
  if (!set.size) memoryClientGames.delete(clientId);
}

function memoryOwners(gameId) {
  let set = memoryGameOwners.get(gameId);
  if (!set) {
    set = new Set();
    const legacy = memoryOwner.get(gameId);
    if (legacy) set.add(legacy);
    memoryGameOwners.set(gameId, set);
  }
  return set;
}

const memoryImpl = {
  async getOwner(gameId) {
    return memoryOwner.get(gameId) || Array.from(memoryOwners(gameId))[0] || null;
  },
  async getGameOwners(gameId) {
    return Array.from(memoryOwners(gameId));
  },
  async setOwner(gameId, clientId) {
    const previous = await this.getGameOwners(gameId);
    previous.forEach((id) => removeMemoryClientGame(id, gameId));
    const set = new Set([clientId]);
    memoryGameOwners.set(gameId, set);
    memoryOwner.set(gameId, clientId);
    addMemoryClientGame(clientId, gameId);
  },
  async addOwner(gameId, clientId) {
    const set = memoryOwners(gameId);
    set.add(clientId);
    if (!memoryOwner.has(gameId)) memoryOwner.set(gameId, clientId);
    addMemoryClientGame(clientId, gameId);
  },
  async removeOwner(gameId, clientId) {
    const existing = await this.getGameOwners(gameId);
    const removeAll = !clientId;
    const removed = removeAll ? existing : existing.filter((id) => id === clientId);
    removed.forEach((id) => removeMemoryClientGame(id, gameId));
    const set = memoryOwners(gameId);
    removed.forEach((id) => set.delete(id));
    if (!set.size) {
      memoryGameOwners.delete(gameId);
      memoryOwner.delete(gameId);
    } else {
      memoryOwner.set(gameId, Array.from(set)[0]);
    }
  },
  async getClientGames(clientId) {
    return Array.from(memoryClientGames.get(clientId) || []);
  },
};

const redisImpl = {
  async getOwner(gameId) {
    return (await redis(["GET", OWNER_PREFIX + gameId])) || null;
  },
  async getGameOwners(gameId) {
    const members = (await redis(["SMEMBERS", OWNERS_PREFIX + gameId])) || [];
    if (members.length) return members;
    const legacy = await this.getOwner(gameId);
    return legacy ? [legacy] : [];
  },
  async setOwner(gameId, clientId) {
    const previous = await this.getGameOwners(gameId);
    if (previous.length) {
      await Promise.all(previous.map((id) => redis(["SREM", CLIENT_GAMES_PREFIX + id, gameId])));
    }
    await redis(["DEL", OWNERS_PREFIX + gameId]);
    await redis(["SET", OWNER_PREFIX + gameId, clientId]);
    await redis(["SADD", OWNERS_PREFIX + gameId, clientId]);
    await redis(["SADD", CLIENT_GAMES_PREFIX + clientId, gameId]);
  },
  async addOwner(gameId, clientId) {
    const current = await this.getGameOwners(gameId);
    await redis(["SADD", OWNERS_PREFIX + gameId, clientId]);
    if (!current.length) await redis(["SET", OWNER_PREFIX + gameId, clientId]);
    await redis(["SADD", CLIENT_GAMES_PREFIX + clientId, gameId]);
    // Migra uma posse antiga salva apenas na chave singular para o novo set.
    if (current.length === 1 && current[0] !== clientId) {
      await redis(["SADD", OWNERS_PREFIX + gameId, current[0]]);
    }
  },
  async removeOwner(gameId, clientId) {
    const existing = await this.getGameOwners(gameId);
    const removed = clientId ? existing.filter((id) => id === clientId) : existing;
    if (!removed.length) return;
    await Promise.all(removed.map((id) => redis(["SREM", CLIENT_GAMES_PREFIX + id, gameId])));
    if (!clientId) {
      await redis(["DEL", OWNERS_PREFIX + gameId]);
      await redis(["DEL", OWNER_PREFIX + gameId]);
      return;
    }
    await redis(["SREM", OWNERS_PREFIX + gameId, clientId]);
    const remaining = existing.filter((id) => id !== clientId);
    if (!remaining.length) await redis(["DEL", OWNER_PREFIX + gameId]);
    else if ((await this.getOwner(gameId)) === clientId) await redis(["SET", OWNER_PREFIX + gameId, remaining[0]]);
  },
  async getClientGames(clientId) {
    return (await redis(["SMEMBERS", CLIENT_GAMES_PREFIX + clientId])) || [];
  },
};

const impl = durable ? redisImpl : memoryImpl;

module.exports = {
  durable,
  getOwner: (gameId) => impl.getOwner(gameId),
  getGameOwners: (gameId) => impl.getGameOwners(gameId),
  setOwner: (gameId, clientId) => impl.setOwner(gameId, clientId),
  addOwner: (gameId, clientId) => impl.addOwner(gameId, clientId),
  removeOwner: (gameId, clientId) => impl.removeOwner(gameId, clientId),
  getClientGames: (clientId) => impl.getClientGames(clientId),
};

module.exports._resetForTests = () => {
  memoryOwner.clear();
  memoryGameOwners.clear();
  memoryClientGames.clear();
};
