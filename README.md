# MYDE

Console retro que roda 100% no navegador: uma vitrine em tela cheia, jogos
que abrem em um toque, e acesso por link exclusivo (feito pra QR code).
Sem framework — Express no servidor, DOM e CSS no cliente.

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

- `GET /` — a vitrine.
- `GET /play/:id` — o player em tela cheia. `id` desconhecido cai num 404 listando os válidos.
- `GET /t/:token` — resgate do link de convite; vincula ao aparelho e manda pra vitrine.
- `GET /admin` — painel pra gerar/gerenciar os links (pede senha).
- `GET /api/keychains` — o catálogo em JSON, útil pra debug.

Arquivos que importam: `server.js` (rotas + HTML), `lib/access.js` (cookies,
vínculo, sessão), `lib/store.js` (onde os links ficam), `public/js/library.js`
(vitrine), `public/js/player.js` (player), `public/js/admin.js` (painel),
`public/sw.js` (cache/PWA), `config/keychains.json` (catálogo).

## Acesso por link exclusivo

Pensado pra QR code: cada link vale pra **um aparelho só**, então copiar a URL
e repassar não dá acesso a mais ninguém.

**Como funciona.** O link sozinho não abre nada — quem abre é o *cookie* que
o servidor entrega pro primeiro aparelho que usar o link:

1. Você gera um link no `/admin` → `https://seu-app/t/AbC123xyz`
2. O primeiro aparelho que abrir esse link fica com ele: o servidor grava o
   vínculo e devolve um cookie assinado (HMAC, `HttpOnly`).
3. Qualquer outro aparelho que abrir a mesma URL vê "este link já está em
   uso" — copiar o endereço não copia o cookie junto.
4. As páginas (`/` e `/play/:id`) só abrem com esse cookie válido.

**Limites — vale saber antes de confiar nisso:**

- Se o link for repassado **antes** do primeiro uso, quem abrir primeiro fica
  com ele. O vínculo é com o primeiro aparelho, não com uma pessoa.
- Nada impede o dono legítimo de emprestar o próprio aparelho.
- Limpar os dados do navegador derruba o vínculo — por isso existe o botão
  **Religar** no admin, que solta o aparelho e deixa o próximo assumir.
- Não é DRM: as ROMs são homebrew de distribuição livre e continuam
  acessíveis por URL direta. O que o link protege é a **experiência**, não os
  arquivos.

### Painel `/admin`

Gera os links, mostra o QR pronto pra imprimir, e acompanha o estado de cada
um: `nunca usado` → `ativado` → `em uso agora` (sinal de vida a cada 60s).
Dá pra **copiar o link**, **baixar o QR** (PNG), **religar** (soltar o
aparelho), **revogar** (corta o acesso na hora) e **apagar**.

### Ligando de verdade (3 variáveis)

O deploy sobe com `ACCESS_MODE=open`, ou seja, **aberto pra todo mundo** — é
o que mantém o demo público funcionando. Pra trancar:

| variável | pra quê |
|---|---|
| `ADMIN_PASSWORD` | senha do `/admin`. Sem ela o painel não abre. |
| `ACCESS_SECRET` | segredo que assina os cookies. Precisa ser fixo entre deploys, senão todo mundo é deslogado a cada publicação. Gere com `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. |
| `ACCESS_MODE=locked` | passa a exigir link pra entrar. |

E mais uma coisa, que **não é opcional em produção**: os links precisam de um
Redis (Vercel KV ou Upstash) via `KV_REST_API_URL` + `KV_REST_API_TOKEN`. Sem
isso eles ficam só na memória do processo — e em serverless o processo morre a
toda hora, então o vínculo com o aparelho sumiria sozinho e a proteção não
valeria nada. O admin avisa em amarelo quando está nesse modo.

## A vitrine (`GET /`)

Cara de painel de console, não de site. Uma tela só, sem rolagem:

- **A arte manda.** A capa do jogo é um retângulo grande (~45% da tela num
  celular, 43% no desktop) e a mesma arte, borrada e sangrando até as bordas,
  vira o fundo da tela inteira. Some com o resto: barra de 44px com a marca e
  três ícones, e embaixo só console · gênero · título · JOGAR.
- **O card nunca corta a arte.** O card é alto (pra encher a tela do celular)
  mas a arte é larga; em vez de cortar, a própria arte borrada e ampliada
  preenche o fundo do card (`.tile::before`) e a versão nítida fica inteira
  por cima. Mesmo truque de app de música.
- **Cor viva.** Um `<canvas>` lê a cor média da capa ativa e repinta acento,
  brilho e marca. Cada jogo dá uma cor diferente (testado: 8 jogos, 8 cores).
- **Busca escondida** atrás da lupa — só ocupa espaço quando é chamada.
- **Destaques abrem a vitrine.** Jogos com `"featured": true` no config vêm
  primeiro no trilho e ganham selo dourado "Exclusivo MYDE" no card em foco
  mais uma pastilha "Exclusivo" no rodapé.
- Arrasta, toca numa capa lateral, usa as setas ou ← →. O arrasto só assume o
  gesto depois de detectar que é horizontal.

### O arrasto segue o dedo

Comportamento nativo de carrossel, não invertido: **puxar da direita pra
esquerda avança** pro próximo jogo, puxar da esquerda pra direita volta pro
anterior — e o trilho anda junto com o dedo enquanto você arrasta (em repouso
o card ativo está em `0px`; arrastando 90px pra esquerda ele está em `-90px`).

Três detalhes que fazem parecer app de console e não `<div>` com `onclick`:

- **Peteleco (flick) conta.** Velocidade acima de ~0.45px/ms avança um jogo
  mesmo que o dedo tenha andado pouco. Arrasto curto e lento volta pro mesmo
  card.
- **Resistência nas pontas.** Na primeira e na última capa o trilho ainda se
  move, mas com 32% do deslocamento e teto de meio card — dá o retorno tátil
  de "acabou" sem travar seco.
- **Arrastar não vira clique.** O `setPointerCapture` só entra depois que o
  gesto se confirma horizontal, e o `click` logo após um arrasto é engolido —
  senão soltar o dedo em cima de uma capa abria o jogo sem querer.

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
   Esses headers estão em **`vercel.json`**, não no Express: em produção a
   Vercel serve `public/` direto pelo CDN dela e o `express.static` nem é
   chamado, então configurar só no servidor não teria efeito nenhum lá (foi
   conferido no deploy — vinha `max-age=0`). O `setHeaders` do Express
   continua no código pro `npm start` local se comportar igual.
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
    "tags": ["pássaro", "voo", "obstáculo", "aves", "reflexo"],
    "featured": false
  }
}
```

`cover` é o nome do arquivo em `public/covers/` (aceita `.png`/`.gif`/`.jpg`,
o que o screenshot original do jogo já era). `tags` é a lista de
palavras-chave temáticas usada na busca inteligente (ver seção acima).
`featured` (opcional) promove o jogo a **exclusivo**: ele pula pra frente do
trilho e ganha o selo dourado. É só ligar a flag — não tem nada hardcoded no
código, então dá pra eleger outros destaques a qualquer momento.

29 jogos, em 4 cores (`nes`, `snes`, `gba`, `segaMD`) — busca por nome/gênero/
tema e filtro por console ficam embutidos no próprio carrossel da tela
inicial. Os dois marcados com ★ são os destaques atuais.

| id                      | core   | jogo                          | gênero          |
|-------------------------|--------|-------------------------------|------------------|
| `flappybird-nes`        | nes    | Flappy Bird                   | Reflexo          |
| `invaders-nes`          | nes    | Invaders                      | Nave / Tiro      |
| `cheril-nes`            | nes    | Cheril the Goddess            | Plataforma       |
| `driar-nes`             | nes    | Driar                         | Ação-aventura    |
| `bootee-nes`            | nes    | Bootee                        | Plataforma       |
| `assimilate-nes`        | nes    | Assimilate                    | Metroidvania     |
| `nova-nes` ★            | nes    | Nova the Squirrel              | Plataforma       |
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
| `plataforma-md` ★       | segaMD | Plataforma Ultimate           | Plataforma       |
| `megacheril-md`         | segaMD | Mega Cheril Perils            | Plataforma       |

`public/roms/` já passou de ~16MB com essa lista toda — segue tranquilo bem
abaixo do limite de bundle de qualquer plano da Vercel, mas é bom saber que
tá crescendo se for continuar adicionando jogos.

### Sobre as ROMs (e por que não tem Mario/Sonic)

Nada de ROM comercial aqui — nem Nintendo, nem Sega, nem ninguém. Mario e
Sonic são propriedade da Nintendo/Sega; eu não baixo, hospedo nem linko ROM
pirateada desses jogos, então não incluí. O que fiz em troca: escolhi os
melhores jogos **homebrew** (feitos por fãs, de graça, para redistribuição)
que dão a mesma vibe retrô — plataforma, ação-aventura estilo Zelda,
nave/tiro, RPG de ação — em vez de clones ou ROM hacks disfarçados.

**Os "exclusivos" são o mecanismo, não os personagens.** A flag `featured`
existe justamente pra você eleger o carro-chefe da vitrine. Hoje ela está em
dois platformers livres que ocupam esses dois lugares: **Nova the Squirrel**
(NES, plataforma com bichinho, o mais próximo de um mascote que dá pra
distribuir legalmente) e **Plataforma Ultimate** (Mega Drive, corre e junta
moedas). Se você tiver licença ou dump legal de um Mario/Sonic seu, é uma
linha no `config/keychains.json` — `gameUrl` + `featured: true` — e ele vira
o exclusivo da vitrine sem tocar em código.

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

Rodado automaticamente (Playwright) a cada alteração, dois conjuntos:

**Interface** — layout sem rolagem em 320x568 / 360x740 / 390x844 / 844x390 /
1280x800, zero erro de JS, busca temática e ranking, sugestão, cor/fundo
acompanhando a arte, arrasto e teclado, service worker, instalação nos dois
caminhos, player (sem popup duplo, gamepad enxuto) e as 27 rotas de jogo.

**Acesso** — admin pede senha e recusa senha errada, API do admin bloqueada
sem sessão, geração de link com QR, primeiro aparelho entra, segundo aparelho
com o link copiado é barrado (403), visitante sem link é barrado, painel
mostra "em uso agora", revogar corta na hora, reativar devolve e religar
transfere o link pro próximo aparelho.

Pra conferir no celular, o que só dá pra ver lá:

- [ ] Um toque no play e o jogo abre — sem popup pedindo segundo clique
- [ ] O jogo entra já passando da tela de título
- [ ] Roda liso, sem travar
- [ ] Save state: jogar, salvar, F5 → volta de onde parou
- [ ] Botão Instalar → app abre em tela cheia sem barra
- [ ] Ler o QR num celular, depois tentar o mesmo link em outro → o segundo é barrado

## Fora de escopo (por enquanto)

- Leitura de NFC (o `/t/:token` já é o destino que a tag vai apontar)
- Conta/login de usuário — o vínculo hoje é com o aparelho, não com uma pessoa
- Save state em banco (o IndexedDB do navegador dá conta desta fase)

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
`cdn.emulatorjs.org`, então **nenhum jogo rodou de fato aqui dentro**. Foi
testado automaticamente tudo o mais: vitrine, layout em 5 tamanhos, busca,
sugestão, tema, service worker, instalação, o controle de acesso ponta a
ponta, e o fluxo do player até o clique ser repassado pro botão do EmulatorJS
(com o botão dele simulado, inclusive aparecendo com atraso pra imitar rede
lenta).

O que só dá pra confirmar com o CDN acessível: o core WASM carregando, o
tempo real de abertura, e se o "pular abertura" acerta o timing em cada
título.
