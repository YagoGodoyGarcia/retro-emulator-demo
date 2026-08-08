# Retro Emulator Demo (EmulatorJS)

Demo standalone pra validar: **abrir um link e cair direto no jogo, com save
state persistente** — sem NFC ainda (isso é o próximo passo; aqui o "chaveiro
lido" é só um `keyId` na URL).

## Deploy na Vercel

Repo já vem pronto pra zero-config: `api/index.js` exporta o app Express e
`vercel.json` reescreve todas as rotas pra essa function. É só importar este
repo na Vercel (New Project → Import Git Repository) sem mexer em nenhuma
configuração de build — o Root Directory é a raiz do repo mesmo.

## Rodando local

```bash
npm install
cp .env.example .env   # opcional, os defaults já funcionam
npm start
```

Abre em `http://localhost:3000`.

## Rotas

- `GET /` — tela inicial com o carrossel 3D da biblioteca (ver seção abaixo). Cada capa leva pra `/play/:keyId`, simulando o redirect que o NFC vai fazer depois.
- `GET /play/:keyId` — tela cheia do EmulatorJS já configurado pro jogo daquele `keyId`. Se o `keyId` não existir em `config/keychains.json`, mostra 404 com a lista dos IDs válidos.
- `GET /api/keychains` — JSON com o mapeamento `keyId -> config`, útil pra debug.

## Carrossel 3D da tela inicial

Em vez de lista/grid rolável, a tela inicial usa um carrossel estilo
CoverFlow: a capa ativa fica grande e de frente, as vizinhas encolhem, giram
no eixo Y e ficam pra trás (`perspective` + `rotateY` + `translateZ` em
`public/css/style.css`), tudo dentro de uma altura fixa — a experiência
inteira (busca, filtro, escolher e ir pro jogo) cabe numa tela só, sem
precisar rolar.

Como navegar:
- **Arrasta** a capa ativa pra esquerda/direita (mouse ou touch, via
  Pointer Events) — solta e ela "estala" pro jogo mais próximo.
- **Toca numa capa lateral** — ela vira a ativa. Toca de novo (ou no botão
  "Jogar agora" embaixo) — abre o jogo.
- Setas ‹ › do lado, ou ← → do teclado com o carrossel focado.
- Busca e os chips de console (NES/SNES/GBA/Mega Drive) recalculam na hora
  quais capas entram no carrossel — tudo client-side, sem round-trip pro
  servidor, então cada tecla digitada responde na hora.

Implementação é só CSS transform + Pointer Events puro (sem lib de
carrossel) — mantém a pegada "sem framework pesado" do projeto e fica leve
em qualquer celular.

## Biblioteca de jogos

Mapeamento em `config/keychains.json`. Cada entrada:

```json
{
  "flappybird-nes": {
    "core": "nes",
    "gameUrl": "/roms/flappybird.nes",
    "gameId": "flappybird-nes",
    "title": "Flappy Bird",
    "genre": "Reflexo"
  }
}
```

27 jogos, em 4 cores (`nes`, `snes`, `gba`, `segaMD`) — busca por nome/gênero
e filtro por console ficam embutidos no próprio carrossel da tela inicial.

| id                      | core   | jogo                          | gênero          |
|-------------------------|--------|-------------------------------|------------------|
| `flappybird-nes`        | nes    | Flappy Bird                   | Reflexo          |
| `invaders-nes`          | nes    | Invaders                      | Nave / Tiro      |
| `cheril-nes`            | nes    | Cheril the Goddess            | Plataforma       |
| `driar-nes`             | nes    | Driar                         | Ação-aventura    |
| `bootee-nes`            | nes    | Bootee                        | Plataforma       |
| `assimilate-nes`        | nes    | Assimilate                    | Metroidvania     |
| `nova-nes`              | nes    | Nova the Squirrel              | Plataforma       |
| `twindragons-nes`       | nes    | Twin Dragons                  | Plataforma       |
| `owlia-nes`             | nes    | The Legends of Owlia          | Ação-aventura    |
| `nomolos-nes`           | nes    | Nomolos: Storming the Catsle  | Plataforma       |
| `sgthelmet-nes`         | nes    | Sgt. Helmet Training Day      | Plataforma       |
| `supertiltbro-nes`      | nes    | Super Tilt Bro                | Luta             |
| `rockfall-snes`         | snes   | Rockfall                      | Puzzle / Ação    |
| `nwarp-snes`            | snes   | N-Warp Daisakusen             | Nave / Tiro      |
| `astrohawk-snes`        | snes   | Astro Hawk                    | Nave / Tiro      |
| `hilda-snes`            | snes   | Hilda                         | Aventura         |
| `superbossgaiden-snes`  | snes   | Super Boss Gaiden             | Ação             |
| `anguna-gba`            | gba    | Anguna                        | Ação-aventura    |
| `metalwarrior4-gba`     | gba    | Metal Warrior 4               | Ação-RPG         |
| `airball-gba`           | gba    | Airball                       | Puzzle / Ação    |
| `castlemaster-gba`      | gba    | Castlemaster                  | Estratégia       |
| `hexavirus-gba`         | gba    | Hexavirus                     | Puzzle           |
| `spout-gba`             | gba    | Spout                         | Puzzle / Física  |
| `junkbots-md`           | segaMD | Junkbots                      | Ação             |
| `astroperdido-md`       | segaMD | Astro Perdido                 | Nave / Tiro      |
| `downforce-md`          | segaMD | Downforce                     | Corrida          |
| `miniplanets-md`        | segaMD | Miniplanets                   | Puzzle / Ação    |

`public/roms/` já passou de ~14MB com essa lista toda — segue tranquilo bem
abaixo do limite de bundle de qualquer plano da Vercel, mas é bom saber que
tá crescendo se for continuar adicionando jogos.

### Sobre as ROMs (e por que não tem Mario/Sonic)

Nada de ROM comercial aqui — nem Nintendo, nem Sega, nem ninguém. Mario e
Sonic são propriedade da Nintendo/Sega; eu não baixo, hospedo nem linko ROM
pirateada desses jogos, então não incluí. O que fiz em troca: escolhi os 10
melhores jogos **homebrew** (feitos por fãs, de graça, para redistribuição)
que dão a mesma vibe retrô — plataforma, ação-aventura estilo Zelda,
nave/tiro, RPG de ação — em vez de clones ou ROM hacks disfarçados.

Todas vêm do [`retrobrews`](https://github.com/retrobrews) (mesmo projeto
citado no briefing original), ficam versionadas em `public/roms/` e são
servidas same-origin pelo próprio app (evita depender de CORS/disponibilidade
de CDN de terceiro pra ROM carregar). Se você tiver uma ROM própria (dump
legal de um cartucho seu, por exemplo) e quiser trocar alguma entrada por
ela, é só apontar o `gameUrl` — ver seção abaixo.

Os `id` (`flappybird-nes`, etc.) são só chaves internas — troque por
`mario-nes`, `sonic-genesis` ou o que fizer sentido quando o NFC entrar
(mock disso, ver "Fora de escopo"), já que o mapeamento é 100% definido em
`config/keychains.json`.

### Trocar a ROM sem mexer em código

Duas formas:

1. **Editar `config/keychains.json`** — muda `core`/`gameUrl`/`title` do keyId.
2. **Variável de ambiente**, sem tocar no JSON:
   ```
   GAMEURL_FLAPPYBIRD_NES=https://exemplo.com/outra-rom.nes
   ```
   Padrão do nome: `GAMEURL_` + o `keyId` em maiúsculo com tudo que não é
   `A-Z0-9` virando `_`. Também dá pra trocar a CDN do EmulatorJS via
   `EMULATORJS_CDN_URL` (ver `.env.example`).

## Como o save state funciona

O EmulatorJS salva automaticamente no **IndexedDB do navegador** (nada de
backend/banco aqui, como pedido). O que separa o save de cada "chaveiro" é o
`EJS_gameID`, setado como o próprio `keyId` da URL — por isso `/play/mario-nes`
e `/play/sonic-genesis` nunca vão compartilhar save.

Cada página de player mostra um badge no canto superior direito com o tempo
de carregamento (core WASM + ROM) até o jogo começar a rodar
(`EJS_onGameStart`), e loga no console quando um save state é salvo/carregado
(`EJS_onSaveState` / `EJS_onLoadState`) — usa isso pra validar.

## Um toque só — sem o "Click to resume Emulator"

O `/play/:keyId` **não** usa `EJS_startOnLoaded`. Isso é de propósito: esse
flag faz o EmulatorJS simular um clique sozinho assim que a página carrega,
sem gesto real do usuário — e o navegador (principalmente Safari/iOS) só
libera áudio quando o `AudioContext` é criado dentro de um clique de verdade.
Com o clique falso, o áudio nascia suspenso, e o próprio EmulatorJS detectava
isso e mostrava um popup extra ("Click to resume Emulator", às vezes com o
título aparecendo como "undefined") pedindo um SEGUNDO toque pra liberar o
som — exatamente o bug de "preciso clicar duas vezes" que apareceu no teste.

Como corrigi: o botão nativo do EmulatorJS (`.ejs_start_button`) fica
escondido via CSS, e o nosso próprio botão "Toque para jogar" repassa o
clique real pra ele (`realBtn.click()`, chamado de dentro do mesmo gesto do
usuário) assim que a pessoa toca. Como o download do core/ROM só começa
depois desse clique de verdade, o `AudioContext` nasce dentro da janela de
permissão do navegador e nunca fica suspenso — um toque só, sem popup
nenhum no meio. Enquanto carrega, o botão vira um spinner (⏳) e some de
verdade só quando o jogo realmente começa (`EJS_onGameStart`), sem deixar
tela preta no meio do caminho.

Esse mesmo toque também:

1. Pede tela cheia de verdade (`requestFullscreen`), escondendo a barra de
   endereço/abas do navegador.
2. Trava a orientação em paisagem de verdade (`screen.orientation.lock`).
3. Segura a tela ligada (`navigator.wakeLock`), pra não apagar no meio do jogo.

Além disso, `touch-action`/`overscroll-behavior`/`user-select` ficam
desligados na página do player, pra evitar puxar a página (pull-to-refresh),
voltar por swipe, ou abrir o menu de copiar/segurar do iOS sem querer
enquanto o polegar tá em cima dos controles virtuais.

### Controle virtual sem excesso de botão

Por padrão o EmulatorJS empilha botões de avanço/redução de velocidade
("Fast"/"Slow", aparecia como "Rápido"/"Lento" traduzido) em cima de
Start/Select em **todo** core — foi o que causava aquela sobreposição
estranha de botões na tela. `VIRTUAL_GAMEPAD` em `server.js` define o layout
por core (`nes`/`snes`/`gba`/`segaMD`) igual ao padrão oficial do
EmulatorJS — mesmos `input_value`/posições, só sem esses dois botões extras
— via `EJS_VirtualGamepadSettings`. Resultado: só D-pad + os botões que o
console realmente tem, sem sobra ocupando a tela.

**Nada de girar só visualmente por CSS** (isso já foi tentado e removido): o
próprio EmulatorJS recalcula a posição dos botões virtuais com base no
tamanho real da janela (`window.innerWidth/innerHeight`), então um giro
"fake" só na aparência deixa esses botões espalhados no lugar errado — o
EmulatorJS continua achando que a tela tá em pé. Só o giro de verdade (via
`screen.orientation.lock`, ou a própria pessoa girando o aparelho) faz ele
desenhar certo. Quando não dá pra travar a orientação (iOS, ver abaixo), o
player mostra um aviso discreto "🔄 Gire o celular pra jogar em paisagem"
que some sozinho assim que a tela realmente vira (`@media (orientation:
landscape)` — nenhum JS envolvido em esconder o aviso).

### iOS (Safari, Chrome, qualquer um) não deixa esconder a barra do navegador

Isso é limitação da Apple, não bug daqui: toda WebKit em iOS/iPadOS bloqueia
`requestFullscreen()` numa aba normal — só funciona quando a página é aberta
a partir de um ícone salvo na **Tela de Início** (modo "standalone"). Por
isso:

- O app já vem com `manifest.webmanifest` + meta tags da Apple
  (`apple-mobile-web-app-capable`, ícone em `public/icons/`) prontos pro
  "Adicionar à Tela de Início" abrir sem nenhuma barra.
- A tela inicial mostra um aviso pra quem tá no iOS fora do modo standalone,
  explicando o Compartilhar → Adicionar à Tela de Início (some depois que a
  pessoa fecha, guardado no `localStorage`).
- O botão "toque pra jogar" detecta `document.fullscreenEnabled` e só promete
  "tela cheia" quando o navegador realmente suporta (Android/Chrome
  desktop) — no iOS ele só diz "Toque para jogar", sem prometer o que não
  pode entregar.
- `screen.orientation.lock` também não é suportado em iOS fora do modo
  standalone; quem já tá com o app salvo na Tela de Início consegue travar a
  orientação normalmente. Quem não travou vê o aviso "gire o celular"
  (acima) e joga em pé mesmo — funciona, só não é o ideal pra um jogo
  desenhado pra paisagem.

Resumindo: no Android e desktop o botão já esconde a UI do navegador sozinho.
No iPhone, o caminho é a pessoa salvar o link na Tela de Início uma vez — daí
abre sempre em tela cheia de verdade. **Não existe nenhuma API de navegador
que deixe um site disparar o "Adicionar à Tela de Início" sozinho, em
nenhuma plataforma** — é decisão de design da Apple (e também do Chrome/
Android) pra evitar spam de instalação; o máximo que dá pra fazer é deixar a
instrução bem clara, que é o que o aviso na tela inicial faz.

## Checklist de validação

Testar em viewport mobile (Chrome DevTools > device toolbar) e, se possível,
num celular de verdade:

- [ ] Na tela inicial, arrastar o carrossel navega pelas capas e o painel embaixo ("Jogar agora") atualiza junto
- [ ] Buscar por gênero (ex: "nave", "corrida") e trocar o filtro de console reduzem o carrossel na hora, sem recarregar a página
- [ ] `/play/:keyId` carrega o jogo sozinho (sem tela de configuração), e o toque no botão "jogar em tela cheia" esconde a UI do navegador e vira a tela pra paisagem
- [ ] Roda liso em mobile
- [ ] Jogar um pouco, salvar save state (menu do EmulatorJS), dar F5 → carrega de onde parou
- [ ] Salvar em `/play/flappybird-nes`, ir em `/play/invaders-nes` → save não vaza entre os dois
- [ ] Conferir o badge de tempo de carregamento no primeiro load (core WASM é pesado)
- [ ] Controles virtuais não disparam pull-to-refresh, voltar por swipe ou menu de copiar/segurar

## Fora de escopo (por enquanto)

- Leitura de NFC (o `keyId` na URL é o mock disso)
- Autenticação/usuário
- Persistência de save state em banco (IndexedDB do navegador é suficiente pra essa validação)

## Troubleshooting

**Menu/controles do EmulatorJS aparecem, mas a tela do jogo fica cinza e nunca
carrega:** normalmente é a ROM não terminando de baixar (rede, CORS, ROM
corrompida). Abre o DevTools (F12) → aba Console e Network:
- Erro tipo "Network Error" na tela ou no console → a requisição de
  `gameUrl` falhou. Confirma em Network se `GET /roms/<arquivo>` voltou 200.
- Nenhum erro visível, só trava → deixa a aba aberta mais uns segundos (o
  core WASM é pesado, principalmente no primeiro load) e confere se
  `EJS_onGameStart` disparou no console (o badge no canto some quando roda).
- Se quiser trocar a ROM por outra, garanta que a URL/arquivo é acessível
  pelo navegador do jeito que for testar (same-origin, como `/roms/...`,
  evita qualquer dor de cabeça de CORS de terceiro).

## Nota sobre este ambiente de desenvolvimento

Este código foi escrito num sandbox cujo proxy de rede bloqueia
`cdn.emulatorjs.org` (a CDN pública do EmulatorJS), então não deu pra abrir o
player num browser real e confirmar visualmente o carregamento do core/ROM
e o fluxo de save state aqui dentro. As rotas Express, a separação de config
por `keyId`, a montagem do HTML/CSS e os links das ROMs homebrew (`retrobrews`)
foram conferidos manualmente (`curl`, checagem de CORS/HTTP 200 nas ROMs).
Roda o checklist acima no seu ambiente pra fechar a validação.
