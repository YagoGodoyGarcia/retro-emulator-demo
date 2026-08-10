/* Posse exclusiva por jogo: qual cliente é dono de qual gameId.
 *
 * Um jogo sem registro aqui continua "aberto" — se comporta exatamente como
 * antes, governado só por requireAccess (lib/access.js). Um jogo COM
 * registro só é jogável pela conta dona; todo mundo mais (inclusive quem
 * tem link de convite válido) fica de fora. É essa entrada em cena que faz
 * um jogo virar "exclusivo" de verdade.
 *
 * Um jogo tem no máximo um dono por vez (não é "várias cópias numeradas" —
 * atribuir de novo troca o dono, não soma). Mesmo padrão Redis-com-fallback
 * dos outros stores do projeto.
 */

const { durable, redis } = require("./redis");

const OWNER_PREFIX = "myde:owner:"; // gameId -> clientId
const CLIENT_GAMES_PREFIX = "myde:client-games:"; // clientId -> Set(gameId)

const memoryOwner = new Map();
const memoryClientGames = new Map();

const memoryImpl = {
  async getOwner(gameId) {
    return memoryOwner.get(gameId) || null;
  },
  async setOwner(gameId, clientId) {
    const prevOwner = memoryOwner.get(gameId);
    if (prevOwner && prevOwner !== clientId) {
      const prevSet = memoryClientGames.get(prevOwner);
      if (prevSet) prevSet.delete(gameId);
    }
    memoryOwner.set(gameId, clientId);
    if (!memoryClientGames.has(clientId)) memoryClientGames.set(clientId, new Set());
    memoryClientGames.get(clientId).add(gameId);
  },
  async removeOwner(gameId) {
    const prevOwner = memoryOwner.get(gameId);
    memoryOwner.delete(gameId);
    if (prevOwner) {
      const prevSet = memoryClientGames.get(prevOwner);
      if (prevSet) prevSet.delete(gameId);
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
  async setOwner(gameId, clientId) {
    const prevOwner = await this.getOwner(gameId);
    if (prevOwner && prevOwner !== clientId) {
      await redis(["SREM", CLIENT_GAMES_PREFIX + prevOwner, gameId]);
    }
    await redis(["SET", OWNER_PREFIX + gameId, clientId]);
    await redis(["SADD", CLIENT_GAMES_PREFIX + clientId, gameId]);
  },
  async removeOwner(gameId) {
    const prevOwner = await this.getOwner(gameId);
    await redis(["DEL", OWNER_PREFIX + gameId]);
    if (prevOwner) await redis(["SREM", CLIENT_GAMES_PREFIX + prevOwner, gameId]);
  },
  async getClientGames(clientId) {
    return (await redis(["SMEMBERS", CLIENT_GAMES_PREFIX + clientId])) || [];
  },
};

const impl = durable ? redisImpl : memoryImpl;

module.exports = {
  durable,
  getOwner: (gameId) => impl.getOwner(gameId),
  setOwner: (gameId, clientId) => impl.setOwner(gameId, clientId),
  removeOwner: (gameId) => impl.removeOwner(gameId),
  getClientGames: (clientId) => impl.getClientGames(clientId),
};
