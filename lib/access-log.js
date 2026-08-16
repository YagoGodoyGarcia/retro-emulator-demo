/* Auditoria leve de acesso ao produto.
 *
 * Registra login/claim e abertura de jogos por cliente. Em produção usa Redis
 * com uma lista limitada por cliente; em desenvolvimento cai para memória.
 */

const { durable, redis } = require("./redis");

const PREFIX = "myde:access-log:";
const LIMIT = 200;
const memory = new Map();

function cleanEvent(event) {
  return {
    at: Number(event.at) || Date.now(),
    type: String(event.type || "visit").slice(0, 30),
    gameId: event.gameId ? String(event.gameId).slice(0, 160) : null,
    path: event.path ? String(event.path).slice(0, 240) : null,
    userAgent: event.userAgent ? String(event.userAgent).slice(0, 240) : null,
  };
}

async function record(clientId, event) {
  if (!clientId) return;
  const row = cleanEvent(event);
  if (durable) {
    const key = PREFIX + clientId;
    await redis(["LPUSH", key, JSON.stringify(row)]);
    await redis(["LTRIM", key, "0", String(LIMIT - 1)]);
    return;
  }
  const list = memory.get(clientId) || [];
  list.unshift(row);
  memory.set(clientId, list.slice(0, LIMIT));
}

async function list(clientId, limit = 50) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 50, LIMIT));
  if (durable) {
    const rows = (await redis(["LRANGE", PREFIX + clientId, "0", String(safeLimit - 1)])) || [];
    return rows.map((raw) => {
      try { return typeof raw === "string" ? JSON.parse(raw) : raw; } catch (e) { return null; }
    }).filter(Boolean);
  }
  return (memory.get(clientId) || []).slice(0, safeLimit);
}

async function summary(clientId) {
  const events = await list(clientId, LIMIT);
  return {
    visits: events.filter((e) => e.type === "visit" || e.type === "login" || e.type === "claim").length,
    plays: events.filter((e) => e.type === "play").length,
    lastEventAt: events[0] ? events[0].at : null,
    events,
  };
}

module.exports = { durable, record, list, summary, LIMIT };
