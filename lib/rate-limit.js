/* Limitador simples por IP, em memória.
 *
 * Honesto sobre a limitação (mesma ressalva do fallback de memória em
 * lib/store.js): na Vercel cada instância serverless tem sua própria
 * memória, então isso não é uma trava dura entre processos diferentes —
 * mas já corta automação grosseira (script batendo várias vezes seguidas
 * na mesma instância morna) e funciona 100% em hosting tradicional de
 * processo único. Defesa em profundidade, não a única linha.
 */

const buckets = new Map(); // "nome:ip" -> { count, resetAt }

function clientIp(req) {
  const fwd = req.headers["x-forwarded-for"];
  if (fwd) return String(fwd).split(",")[0].trim();
  return (req.socket && req.socket.remoteAddress) || "unknown";
}

function limiter(name, { windowMs, max, onLimited }) {
  return function rateLimit(req, res, next) {
    const key = `${name}:${clientIp(req)}`;
    const now = Date.now();
    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }
    bucket.count += 1;
    if (bucket.count > max) {
      res.setHeader("Retry-After", Math.ceil((bucket.resetAt - now) / 1000));
      if (onLimited) return onLimited(req, res);
      return res.status(429).json({ error: "Muitas tentativas. Espera um pouco e tenta de novo." });
    }
    next();
  };
}

// Limpeza periódica pra não crescer sem limite num processo de vida longa
// (dev local / hosting tradicional). unref() pra não segurar o processo vivo
// só por causa desse timer.
const sweep = setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}, 5 * 60 * 1000);
if (sweep.unref) sweep.unref();

module.exports = { limiter };
