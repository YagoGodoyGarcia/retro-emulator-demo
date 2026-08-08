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

- `GET /` — index de teste com os chaveiros mockados (cards que levam pra `/play/:keyId`, simulando o redirect que o NFC vai fazer depois).
- `GET /play/:keyId` — tela cheia do EmulatorJS já configurado pro jogo daquele `keyId`. Se o `keyId` não existir em `config/keychains.json`, mostra 404 com a lista dos chaveiros válidos.
- `GET /api/keychains` — JSON com o mapeamento `keyId -> config`, útil pra debug.

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

10 jogos, em 3 cores (`nes`, `snes`, `gba`) — dá pra buscar por nome/gênero e
filtrar por console direto na tela inicial:

| id                    | core | jogo                | gênero          |
|-----------------------|------|---------------------|------------------|
| `flappybird-nes`      | nes  | Flappy Bird         | Reflexo          |
| `invaders-nes`        | nes  | Invaders            | Nave / Tiro      |
| `cheril-nes`          | nes  | Cheril the Goddess  | Plataforma       |
| `driar-nes`           | nes  | Driar               | Ação-aventura    |
| `bootee-nes`          | nes  | Bootee              | Plataforma       |
| `assimilate-nes`      | nes  | Assimilate          | Metroidvania     |
| `rockfall-snes`       | snes | Rockfall            | Puzzle / Ação    |
| `nwarp-snes`          | snes | N-Warp Daisakusen   | Nave / Tiro      |
| `anguna-gba`          | gba  | Anguna              | Ação-aventura    |
| `metalwarrior4-gba`   | gba  | Metal Warrior 4     | Ação-RPG         |

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

## Tela cheia e paisagem no mobile

O core carrega sozinho em background assim que a página abre
(`EJS_startOnLoaded = true`), mas **tela cheia real, giro pra paisagem e
áudio dependem de um toque do usuário** — é restrição do navegador, não dá
pra disparar isso sozinho no load. Por isso o `/play/:keyId` mostra um botão
"Toque para jogar em tela cheia" por cima do jogo (que já tá rodando por
baixo); um toque nesse botão:

1. Pede tela cheia de verdade (`requestFullscreen`), escondendo a barra de
   endereço/abas do navegador.
2. Trava a orientação em paisagem de verdade (`screen.orientation.lock`).
3. Segura a tela ligada (`navigator.wakeLock`), pra não apagar no meio do jogo.

Além disso, `touch-action`/`overscroll-behavior`/`user-select` ficam
desligados na página do player, pra evitar puxar a página (pull-to-refresh),
voltar por swipe, ou abrir o menu de copiar/segurar do iOS sem querer
enquanto o polegar tá em cima dos controles virtuais.

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
