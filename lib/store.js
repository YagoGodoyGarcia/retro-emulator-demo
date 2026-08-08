/* Armazenamento dos tokens de acesso.
 *
 * Em serverless (Vercel) cada request pode cair numa instância diferente e o
 * processo morre a qualquer momento — memória local NÃO serve como fonte da
 * verdade lá: o vínculo "esse link é daquele aparelho" sumiria sozinho, o que
 * quebra exatamente a proteção que ele existe pra dar.
 *
 * Então: se houver credencial de Redis (Vercel KV / Upstash) nas env vars, usa
 * ela. Se não houver, cai pra memória — bom pra `npm start` local, e a tela de
 * admin avisa em letras garrafais que naquele modo o controle não é confiável.
 *
 * Fala com o Upstash pela REST API (só `fetch`), então não entra dependência
 * nova nem client de Redis no bundle.
 */

const REST_URL =
  process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "";
const REST_TOKEN =
  process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "";

const KEY_PREFIX = "myde:token:";
const INDEX_KEY = "myde:tokens";

const durable = Boolean(REST_URL && REST_TOKEN);

async function redis(command) {
  const res = await fetch(REST_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${REST_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
  });
  if (!res.ok) {
    throw new Error(`Redis ${command[0]} falhou: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  if (data.error) throw new Error(`Redis ${command[0]}: ${data.error}`);
  return data.result;
}

// --- fallback em memória (só dev local) -----------------------------------
const memory = new Map();

const memoryStore = {
  async get(id) {
    return memory.get(id) || null;
  },
  async put(token) {
    memory.set(token.id, token);
    return token;
  },
  async remove(id) {
    memory.delete(id);
  },
  async list() {
    return Array.from(memory.values());
  },
};

// --- Redis ----------------------------------------------------------------
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
  async put(token) {
    await redis(["SET", KEY_PREFIX + token.id, JSON.stringify(token)]);
    await redis(["SADD", INDEX_KEY, token.id]);
    return token;
  },
  async remove(id) {
    await redis(["DEL", KEY_PREFIX + id]);
    await redis(["SREM", INDEX_KEY, id]);
  },
  async list() {
    const ids = (await redis(["SMEMBERS", INDEX_KEY])) || [];
    if (!ids.length) return [];
    const rows = await Promise.all(ids.map((id) => this.get(id)));
    // Um id órfão no índice (token expirado/apagado à mão) não pode derrubar
    // a listagem inteira.
    return rows.filter(Boolean);
  },
};

const store = durable ? redisStore : memoryStore;

module.exports = {
  durable,
  get: (id) => store.get(id),
  put: (token) => store.put(token),
  remove: (id) => store.remove(id),
  list: () => store.list(),
};
