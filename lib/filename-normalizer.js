/* Extrai um título limpo do nome de arquivo de uma ROM — usado pelo
 * importador em lote pra sugerir título sem digitação manual.
 *
 * Nunca é a palavra final: quem chama sempre pode corrigir o resultado (ver
 * README/"editar jogo"). Isso só reduz o trabalho no caso comum.
 */

// Tags de região/revisão/dump que ficam entre () ou [] em nomes de ROM
// (padrão No-Intro/GoodTools/TOSEC: "(U)", "(USA, Europe)", "(PRG1)",
// "[!]"). Remove o grupo inteiro, não só a palavra de dentro.
function stripTags(name) {
  return name.replace(/\([^)]*\)/g, " ").replace(/\[[^\]]*\]/g, " ");
}

function normalizeFilenameToTitle(filename) {
  const noExt = String(filename || "").replace(/\.[^./\\]+$/, "");
  const stripped = stripTags(noExt).replace(/\s+/g, " ").trim();
  // Sobrou vazio (o arquivo era só tag, tipo "(U) [!].nes")? Não inventa
  // título do nada — devolve o nome original sem extensão, pra sempre ter
  // algo editável em vez de sumir com o campo.
  return stripped || noExt.trim() || "jogo-sem-nome";
}

module.exports = { normalizeFilenameToTitle };
