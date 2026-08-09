/* SHA-256 de um arquivo — usado pra identificar ROM/capa e detectar
 * duplicata (seções 16/54 do briefing: hash é o critério real, nome +
 * plataforma é só alerta secundário). Só crypto nativo, sem dependência
 * nova.
 */

const crypto = require("crypto");

function hashBuffer(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

module.exports = { hashBuffer };
