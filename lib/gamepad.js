/* Layout do controle virtual por core.
 *
 * Base: o padrão oficial do EmulatorJS (data/src/emulator.js, setVirtualGamepad),
 * com quatro correções nossas:
 *
 * 1. Sem os botões "Fast"/"Slow", que o EmulatorJS empilha em cima de
 *    Start/Select em TODO core e que só poluíam a tela.
 *
 * 2. Start/Select/Mode saíram do `location: "center"`. Aquele container é o
 *    `.ejs_virtualGamepad_bottom`, que é `left:50%; margin-left:-62px` — ou
 *    seja, o Start nascia exatamente no meio da tela, em cima da ação do jogo.
 *    Agora eles vão pros containers "left"/"right", colados nos cantos de
 *    baixo, logo abaixo do direcional e dos botões de ação.
 *
 * 3. O diamante do SNES do padrão oficial se sobrepõe: X em `left:40` e A em
 *    `left:81` com botões de 50px dão 9px de sobreposição. Aqui o diamante é
 *    ancorado pela direita com passo de 52px, então os botões ficam
 *    encostados mas nunca por cima um do outro.
 *
 * 4. L/R do padrão ficam em `top:-100`, que joga os dois pra fora da tela num
 *    iPhone SE deitado (320px de altura). Recalculado pra caber.
 *
 * Sobre as coordenadas: os containers `.ejs_virtualGamepad_left` e `_right`
 * têm alturas diferentes (125px e 130px), então todo `top` do lado direito
 * leva +5 pra sair na mesma linha do lado esquerdo. E atenção: o EmulatorJS
 * testa `if (info[i].left)`, então **0 é ignorado** — por isso os cantos usam
 * 2, não 0.
 *
 * Qualquer mexida aqui é conferida pelo pw-test/gamepad-harness.js, que
 * remonta esse mesmo DOM com o emulator.css original e mede onde cada botão
 * cai em 4 tamanhos de tela.
 */

// Cantos de baixo, fora da faixa central da tela.
const CORNER_LEFT = { location: "left", left: 2, top: 132 };
const CORNER_RIGHT = { location: "right", right: 2, top: 137 };
const PILL = { fontSize: 15, block: true };

// Ombros no alto, na altura mais alta que ainda cabe numa tela de 320px.
const SHOULDER_LEFT = { location: "left", left: 3, top: -88 };
const SHOULDER_RIGHT = { location: "right", right: 3, top: -83 };
const SHOULDER = { bold: true, block: true };

const LAYOUTS = {
  nes: [
    { type: "button", text: "B", id: "b", location: "right", right: 75, top: 70, bold: true, input_value: 0 },
    { type: "button", text: "A", id: "a", location: "right", right: 5, top: 70, bold: true, input_value: 8 },
    { type: "dpad", id: "dpad", location: "left", left: "50%", right: "50%", joystickInput: false, inputValues: [4, 5, 6, 7] },
    { type: "button", text: "Select", id: "select", ...CORNER_LEFT, ...PILL, input_value: 2 },
    { type: "button", text: "Start", id: "start", ...CORNER_RIGHT, ...PILL, input_value: 3 },
  ],
  snes: [
    // diamante ancorado na direita, passo de 52px: X em cima, Y e A nos lados,
    // B embaixo — a disposição real do controle do Super Nintendo.
    { type: "button", text: "X", id: "x", location: "right", right: 57, top: 0, bold: true, input_value: 9 },
    { type: "button", text: "Y", id: "y", location: "right", right: 109, top: 40, bold: true, input_value: 1 },
    { type: "button", text: "A", id: "a", location: "right", right: 5, top: 40, bold: true, input_value: 8 },
    { type: "button", text: "B", id: "b", location: "right", right: 57, top: 80, bold: true, input_value: 0 },
    { type: "dpad", id: "dpad", location: "left", left: "50%", top: "50%", joystickInput: false, inputValues: [4, 5, 6, 7] },
    { type: "button", text: "L", id: "l", ...SHOULDER_LEFT, ...SHOULDER, input_value: 10 },
    { type: "button", text: "R", id: "r", ...SHOULDER_RIGHT, ...SHOULDER, input_value: 11 },
    { type: "button", text: "Select", id: "select", ...CORNER_LEFT, ...PILL, input_value: 2 },
    { type: "button", text: "Start", id: "start", ...CORNER_RIGHT, ...PILL, input_value: 3 },
  ],
  gba: [
    { type: "button", text: "B", id: "b", location: "right", right: 75, top: 70, bold: true, input_value: 0 },
    { type: "button", text: "A", id: "a", location: "right", right: 5, top: 70, bold: true, input_value: 8 },
    { type: "dpad", id: "dpad", location: "left", left: "50%", top: "50%", joystickInput: false, inputValues: [4, 5, 6, 7] },
    { type: "button", text: "L", id: "l", ...SHOULDER_LEFT, ...SHOULDER, input_value: 10 },
    { type: "button", text: "R", id: "r", ...SHOULDER_RIGHT, ...SHOULDER, input_value: 11 },
    { type: "button", text: "Select", id: "select", ...CORNER_LEFT, ...PILL, input_value: 2 },
    { type: "button", text: "Start", id: "start", ...CORNER_RIGHT, ...PILL, input_value: 3 },
  ],
  segaMD: [
    // passo de 60px em vez dos 70px do padrão: com 70 o botão A invadia o meio
    // da tela num iPhone SE deitado.
    { type: "button", text: "A", id: "a", location: "right", right: 125, top: 70, bold: true, input_value: 1 },
    { type: "button", text: "B", id: "b", location: "right", right: 65, top: 70, bold: true, input_value: 0 },
    { type: "button", text: "C", id: "c", location: "right", right: 5, top: 70, bold: true, input_value: 8 },
    { type: "dpad", id: "dpad", location: "left", left: "50%", right: "50%", joystickInput: false, inputValues: [4, 5, 6, 7] },
    { type: "button", text: "Start", id: "start", ...CORNER_RIGHT, ...PILL, input_value: 3 },
  ],

  // Variante de 6 botões (X/Y/Z além de A/B/C) pro Mega Drive — pra jogos que
  // realmente usam os seis (luta, principalmente). input_value de X/Y/Z
  // (10/9/11) é o mapeamento oficial do core (genesis_plus_gx via retropad),
  // copiado de cdn.emulatorjs.org/stable/data/src/emulator.js
  // (setVirtualGamepad, branch segaMD/segaCD/sega32x) — não é livre pra
  // inventar, botão na tela com input_value errado não faz nada no jogo.
  // Posições seguem o mesmo passo de 60px do segaMD de 3 botões (razão
  // idêntica: 70px invade o meio da tela num iPhone SE deitado), só
  // duplicando a fileira uma linha acima. Não inclui "Mode" (raramente usado
  // e a tela já fica cheia com dpad + 6 botões + Start).
  segaMD6: [
    { type: "button", text: "X", id: "x", location: "right", right: 125, top: 0, bold: true, input_value: 10 },
    { type: "button", text: "Y", id: "y", location: "right", right: 65, top: 0, bold: true, input_value: 9 },
    { type: "button", text: "Z", id: "z", location: "right", right: 5, top: 0, bold: true, input_value: 11 },
    { type: "button", text: "A", id: "a", location: "right", right: 125, top: 70, bold: true, input_value: 1 },
    { type: "button", text: "B", id: "b", location: "right", right: 65, top: 70, bold: true, input_value: 0 },
    { type: "button", text: "C", id: "c", location: "right", right: 5, top: 70, bold: true, input_value: 8 },
    { type: "dpad", id: "dpad", location: "left", left: "50%", right: "50%", joystickInput: false, inputValues: [4, 5, 6, 7] },
    { type: "button", text: "Start", id: "start", ...CORNER_RIGHT, ...PILL, input_value: 3 },
  ],
};

// Consoles de verdade (usado pro <select> do admin e validação de extensão)
// — separado de LAYOUTS porque "segaMD6" não é um console, é uma variante de
// controle do segaMD. Não junta os dois num Object.keys só: uma extensão de
// arquivo ou um core inválido pra "segaMD6" quebraria o upload silenciosamente.
const CORES = ["nes", "snes", "gba", "segaMD"];

module.exports = { ...LAYOUTS, CORES };
