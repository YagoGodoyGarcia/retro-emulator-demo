# Joga Retrô

Vitrine de jogos retro que rodam 100% no navegador (EmulatorJS), instalável
como app. Cada jogo tem uma URL própria (`/play/:id`) — é essa URL que o
chaveiro NFC vai abrir na versão final; por enquanto o `id` é só uma chave
no catálogo e nada disso aparece pro usuário.

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

- `GET /` — a vitrine: carrossel 3D, busca e sugestão numa tela só (ver abaixo).
- `GET /play/:id` — o player em tela cheia, já configurado pro jogo daquele `id`. `id` desconhecido cai num 404 listando os válidos.
- `GET /api/keychains` — o catálogo em JSON, útil pra debug.

Arquivos que importam: `server.js` (rotas + HTML), `public/js/library.js`
(vitrine), `public/js/player.js` (player), `public/sw.js` (cache/PWA),
`config/keychains.json` (catálogo).

## A vitrine (`GET /`)

Uma tela só, sem rolagem nenhuma: `100dvh` em flex column, com o carrossel
em `flex: 1` comendo todo o espaço que sobra. O tamanho da capa é calculado
em JS a partir da largura **e** da altura disponíveis, então ela cresce em
celular alto e encolhe em paisagem sem nunca estourar a tela. Testado de
320x568 até 1280x800.

- **Carrossel 3D** estilo CoverFlow: capa ativa de frente, vizinhas giradas
  no eixo Y e recuadas (`perspective` + `rotateY` + `translateZ`). Arrasta
  com o dedo, toca numa capa lateral, usa as setas ou ← → do teclado.
  O arrasto só assume o gesto depois de detectar que é horizontal, pra não
  trocar de jogo quando a intenção era outra.
- **Capa = screenshot real** do jogo (`public/covers/`), com
  `image-rendering: pixelated` pra não borrar a pixel art.
- **Tema dinâmico**: ao trocar de jogo, um `<canvas>` lê a cor média da capa
  e repinta o acento e o fundo inteiro, com crossfade entre duas camadas
  (`.theme-backdrop`). A cor de cada capa é extraída uma vez e fica em cache.
- **Header enxuto**: só a marca e o botão de instalar (~34px de altura). Toda
  a instrução sobre iOS saiu da tela e virou conteúdo do botão de instalar.

## Instalar como app (PWA)

Botão **Instalar** no canto superior direito:

- **Android / Chrome / Edge**: o navegador entrega o evento
  `beforeinstallprompt`, a gente segura e dispara no clique — instalação
  nativa de verdade, o usuário só confirma no diálogo do sistema.
- **iOS**: a Apple não expõe essa API pra navegador nenhum, então o clique
  abre uma folha com o passo a passo do "Adicionar à Tela de Início". Não
  existe forma de um site se instalar sozinho no iPhone — nem esta nem
  nenhuma outra.

Isso depende de três coisas que estão no repo: `manifest.webmanifest`
completo (nome, ícones 192/512, `start_url`, `display: standalone`), ícones
em `public/icons/` e um service worker com handler de `fetch`. **Sem o
service worker o Chrome nem dispara o `beforeinstallprompt`** — ou seja, o
botão não apareceria.

## Velocidade

O que foi feito pra reduzir o tempo entre abrir o site e estar jogando:

1. **Pré-aquecimento** (`schedulePrefetch` em `library.js`): quando um jogo
   fica parado no centro do carrossel por ~0.5s, a ROM e o core WASM daquele
   sistema começam a baixar em segundo plano, em `requestIdleCallback`.
   Quando o usuário toca em "Jogar", boa parte já está no cache. Respeita
   `saveData` e pula em conexão 2G.
2. **Service worker** (`public/sw.js`): cache-first em capas, ROMs, CSS e JS.
   A segunda visita é praticamente instantânea.
3. **Cache HTTP longo** nos assets imutáveis (`/covers`, `/roms`, `/icons`:
   1 ano, `immutable`). HTML fica de fora pro catálogo nunca ficar velho.
4. **`preconnect`** pro CDN do EmulatorJS já no `<head>`, pra DNS e TLS não
   entrarem no caminho crítico depois.
5. As 4 primeiras capas usam `fetchpriority="high"`; o resto é `lazy`.

## Pular a abertura do jogo

Quase todo jogo retro abre numa tela de título esperando START. Depois que o
core sobe (`EJS_onGameStart`), o `player.js` aperta START sozinho algumas
vezes espaçadas (1.4s, 2.3s, 3.2s, 4.1s) via
`gameManager.simulateInput(0, 3, ...)`, o que atravessa o título e cai
direto no jogo.

O espaçamento é proposital: jogo nenhum aceita input nos primeiros frames, e
apertar rápido demais faz um menu pular duas opções de uma vez. É uma
heurística — funciona pra jogo que começa com START no título, que é a
esmagadora maioria. Pra desligar num jogo específico, põe
`"skipIntro": false` na entrada dele em `config/keychains.json`.

## Busca por tema (com ranking)

Além de nome e gênero, cada jogo tem **tags temáticas** em
`config/keychains.json`, e o `library.js` carrega uma tabela de grupos de
sinônimos. Digitar qualquer palavra de um grupo casa com jogos marcados com
qualquer outra: `guerra` acha um jogo taggeado só como `militar`, `bicho`
acha `esquilo`, `sci-fi` acha `alienígena`. Acento é ignorado
(`normalize("NFD")`), e prefixo funciona (`batal` já puxa `batalha`).

O resultado é **ordenado por relevância**, não filtrado em bloco — foi o que
resolveu o problema de "dragão" devolver 11 jogos empatados:

| onde bateu          | peso |
|---------------------|------|
| título              | 12   |
| tag exata           | 7    |
| gênero              | 5    |
| qualquer campo      | 4    |
| tag via sinônimo    | 2.5  |
| qualquer via sinônimo | 1.5 |

Todos os termos digitados precisam pontuar (AND entre termos, OR entre os
sinônimos de cada termo), e o carrossel já abre no melhor resultado. Na
prática: `dragão` → Twin Dragons; `corrida` → Downforce; `guerra` → Invaders,
Sgt. Helmet e N-Warp na frente, e os jogos "de batalha" atrás.

## Sugestão de jogo (botão ✦)

Motor de recomendação que cruza:

- **histórico local** (`localStorage`): tags dos jogos que você já abriu
  viram afinidade; jogo aberto nas últimas 24h perde peso forte
- **novidade**: jogo nunca aberto ganha bônus
- **variedade**: bônus pra console diferente do último jogado
- **horário**: depois das 22h, jogo calmo (puzzle/reflexo) sobe

Ele devolve o jogo **e o motivo**, que aparece como chip abaixo do título
("novidade que você ainda não jogou", "combina com o que você jogou", "leve
pra essa hora da noite").

> **Sobre o rótulo:** é um motor de pontuação determinístico rodando no
> navegador — regras + histórico local, sem modelo de linguagem, sem chamada
> de rede, sem dado saindo do aparelho. A UI vende como "sugestão
> inteligente" e o comportamento entrega isso de verdade, mas ninguém do time
> deve assumir que existe IA/LLM por trás: não existe. Se um dia virar um
> modelo de verdade, o ponto de troca é a função `recommend()` em
> `public/js/library.js`.

## Biblioteca de jogos

Mapeamento em `config/keychains.json`. Cada entrada:

```json
{
  "flappybird-nes": {
    "core": "nes",
    "gameUrl": "/roms/flappybird.nes",
    "gameId": "flappybird-nes",
    "title": "Flappy Bird",
    "genre": "Reflexo",
    "cover": "flappybird-nes.png",
    "tags": ["pássaro", "voo", "obstáculo", "aves", "reflexo"]
  }
}
```

`cover` é o nome do arquivo em `public/covers/` (aceita `.png`/`.gif`/`.jpg`,
o que o screenshot original do jogo já era). `tags` é a lista de
palavras-chave temáticas usada na busca inteligente (ver seção acima).

27 jogos, em 4 cores (`nes`, `snes`, `gba`, `segaMD`) — busca por nome/gênero/
tema e filtro por console ficam embutidos no próprio carrossel da tela
inicial.

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

O player **não** usa `EJS_startOnLoaded`. Esse flag faz o EmulatorJS simular
um clique sozinho no load, sem gesto real do usuário — e aí o `AudioContext`
nasce suspenso, o próprio EmulatorJS detecta isso e abre um popup pedindo um
SEGUNDO toque ("Click to resume Emulator", às vezes com o título aparecendo
como "undefined").

Em vez disso: o botão nativo dele (`.ejs_start_button`) fica escondido no CSS
e o nosso play-gate repassa o clique de verdade (`realBtn.click()`, chamado
de dentro do mesmo gesto). O download do core/ROM só começa depois desse
clique real, então o áudio nasce liberado e não tem popup nenhum no meio.

Enquanto carrega, o botão vira spinner e aparece uma barra de progresso; o
gate só some quando o jogo realmente começa (`EJS_onGameStart`), pra não
deixar tela preta no caminho. Esse mesmo toque também pede tela cheia
(`requestFullscreen`), trava a orientação em paisagem
(`screen.orientation.lock`) e segura a tela ligada (`navigator.wakeLock`).

### Controle virtual sem excesso de botão

Por padrão o EmulatorJS empilha botões de velocidade ("Fast"/"Slow") em cima
de Start/Select em **todo** core. `VIRTUAL_GAMEPAD` em `server.js` define o
layout por core (`nes`/`snes`/`gba`/`segaMD`) igual ao padrão oficial —
mesmos `input_value` e posições — só sem esses dois. Sobra D-pad + os botões
que o console realmente tem.

### iOS não deixa esconder a barra do navegador

Limitação da Apple: toda WebKit em iOS/iPadOS bloqueia `requestFullscreen()`
numa aba comum — só funciona quando a página abre a partir de um ícone salvo
na Tela de Início. Por isso o botão "Instalar" existe (ver seção do PWA), e
o texto do play-gate só promete "tela cheia" quando
`document.fullscreenEnabled` diz que o navegador entrega.

Sem travar a orientação (caso do iOS fora do modo instalado), o player mostra
"🔄 Gire o celular pra jogar em paisagem", que some sozinho via
`@media (orientation: landscape)`. **Nada de girar por CSS**: o EmulatorJS
posiciona os controles virtuais pelo tamanho real da janela, e girar só na
aparência espalha os botões pro lugar errado.

## Checklist de validação

Rodado automaticamente (Playwright, `TODOS OS TESTES PASSARAM`) a cada
alteração: layout sem scroll em 320x568 / 390x844 / 393x851 / 844x390 /
1280x800, zero erro de JS, busca temática, ranking de relevância, sugestão,
tema dinâmico, registro do service worker, fluxo de instalação nos dois
caminhos (nativo e iOS), e o player inteiro (gate → clique repassado →
`EJS_onGameStart` → pular abertura), além das 27 rotas de jogo, 27 capas e
27 ROMs respondendo 200.

Pra conferir no celular de verdade, o que só dá pra ver lá:

- [ ] Um toque no play e o jogo abre — sem nenhum popup pedindo segundo clique
- [ ] O jogo entra já passando da tela de título (pular abertura)
- [ ] Roda liso, sem travar
- [ ] Save state: jogar, salvar pelo menu do EmulatorJS, F5 → volta de onde parou
- [ ] Save separado por jogo (salvar num, abrir outro, o save não vaza)
- [ ] Botão Instalar → app instala e abre em tela cheia sem barra
- [ ] Controles virtuais não disparam pull-to-refresh nem voltar por swipe

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

O proxy de rede do sandbox onde este código foi escrito bloqueia
`cdn.emulatorjs.org`, então **não deu pra rodar o emulador de verdade aqui
dentro** — nenhum jogo foi visto rodando neste ambiente. O que foi testado
automaticamente: toda a vitrine, o layout em 5 tamanhos de tela, a busca, a
sugestão, o tema, o service worker, a instalação, e o fluxo do player até o
clique ser repassado pro botão do EmulatorJS (com o botão dele simulado,
inclusive aparecendo com atraso pra imitar rede lenta).

O que só dá pra confirmar com o CDN acessível: o core WASM carregando de
fato, o tempo real de abertura, e se o "pular abertura" acerta o timing em
cada jogo. Roda o checklist acima no seu ambiente pra fechar.
