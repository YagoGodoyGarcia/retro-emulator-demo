/* Cliente mínimo do Upstash/Vercel KV via REST API — só `fetch`, sem client
 * de Redis no bundle. Compartilhado entre lib/store.js (tokens de acesso) e
 * lib/library-store.js (catálogo de jogos adicionados pelo admin).
 */

const REST_URL =
  process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "";
const REST_TOKEN =
  process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "";

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

module.exports = { durable, redis };
