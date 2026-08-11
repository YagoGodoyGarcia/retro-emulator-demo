/* Fila de solicitação de acesso: cliente pede um jogo que não é dele, admin
 * aprova (atribui) ou nega. Existe pra dar uma saída de verdade pro cliente
 * quando o catálogo virou "fechado por padrão" — sem isso, pedir um jogo
 * dependeria de mandar mensagem pro admin fora do app.
 *
 * Um pedido pendente por (cliente, jogo) — pedir de novo o mesmo jogo com um
 * pedido já pendente devolve o pedido existente, não duplica.
 */

const crypto = require("crypto");
const { durable, redis } = require("./redis");

const KEY_PREFIX = "myde:request:";
const INDEX_KEY = "myde:requests";
const PENDING_LOOKUP_PREFIX = "myde:request-pending:"; // `${clientId}:${gameId}` -> requestId

function lookupKey(clientId, gameId) {
  return `${clientId}:${gameId}`;
}

function newRequest(clientId, gameId) {
  return {
    id: crypto.randomBytes(9).toString("base64url"),
    clientId,
    gameId,
    status: "pending", // pending | approved | denied
    createdAt: Date.now(),
    resolvedAt: null,
  };
}

// --- fallback em memória (só dev local) -----------------------------------
const memory = new Map();
const memoryPending = new Map();

const memoryImpl = {
  async get(id) {
    return memory.get(id) || null;
  },
  async put(r) {
    memory.set(r.id, r);
    return r;
  },
  async list() {
    return Array.from(memory.values());
  },
  async findPending(clientId, gameId) {
    const id = memoryPending.get(lookupKey(clientId, gameId));
    if (!id) return null;
    const r = memory.get(id);
    return r && r.status === "pending" ? r : null;
  },
  async setPending(clientId, gameId, id) {
    memoryPending.set(lookupKey(clientId, gameId), id);
  },
  async clearPending(clientId, gameId) {
    memoryPending.delete(lookupKey(clientId, gameId));
  },
};

// --- Redis ------------------------------------------------------------
const redisImpl = {
  async get(id) {
    const raw = await redis(["GET", KEY_PREFIX + id]);
    if (!raw) return null;
    try {
      return typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch (e) {
      return null;
    }
  },
  async put(r) {
    await redis(["SET", KEY_PREFIX + r.id, JSON.stringify(r)]);
    await redis(["SADD", INDEX_KEY, r.id]);
    return r;
  },
  async list() {
    const ids = (await redis(["SMEMBERS", INDEX_KEY])) || [];
    if (!ids.length) return [];
    const rows = await Promise.all(ids.map((id) => this.get(id)));
    return rows.filter(Boolean);
  },
  async findPending(clientId, gameId) {
    const id = await redis(["GET", PENDING_LOOKUP_PREFIX + lookupKey(clientId, gameId)]);
    if (!id) return null;
    const r = await this.get(id);
    return r && r.status === "pending" ? r : null;
  },
  async setPending(clientId, gameId, id) {
    await redis(["SET", PENDING_LOOKUP_PREFIX + lookupKey(clientId, gameId), id]);
  },
  async clearPending(clientId, gameId) {
    await redis(["DEL", PENDING_LOOKUP_PREFIX + lookupKey(clientId, gameId)]);
  },
};

const impl = durable ? redisImpl : memoryImpl;

async function createRequest(clientId, gameId) {
  const existing = await impl.findPending(clientId, gameId);
  if (existing) return existing;
  const request = newRequest(clientId, gameId);
  await impl.put(request);
  await impl.setPending(clientId, gameId, request.id);
  return request;
}

async function resolveRequest(id, status) {
  const request = await impl.get(id);
  if (!request || request.status !== "pending") return null;
  request.status = status;
  request.resolvedAt = Date.now();
  await impl.put(request);
  await impl.clearPending(request.clientId, request.gameId);
  return request;
}

/** Outros pedidos pendentes pro MESMO jogo, de OUTROS clientes — usado ao
 * aprovar um pedido, pra não deixar a fila com pedido pendente de um jogo
 * que já tem dono. */
async function listOtherPendingForGame(gameId, excludeRequestId) {
  const all = await impl.list();
  return all.filter(
    (r) => r.gameId === gameId && r.status === "pending" && r.id !== excludeRequestId
  );
}

async function listPending() {
  const all = await impl.list();
  return all.filter((r) => r.status === "pending").sort((a, b) => a.createdAt - b.createdAt);
}

module.exports = {
  durable,
  createRequest,
  resolveRequest,
  listPending,
  listOtherPendingForGame,
  findPending: (clientId, gameId) => impl.findPending(clientId, gameId),
  get: (id) => impl.get(id),
};
