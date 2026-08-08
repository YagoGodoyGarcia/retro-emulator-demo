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

## Chaveiros mockados

Mapeamento em `config/keychains.json`. Cada entrada:

```json
{
  "flappybird-nes": {
    "core": "nes",
    "gameUrl": "https://raw.githubusercontent.com/retrobrews/nes-games/master/flappybird.nes",
    "gameId": "flappybird-nes",
    "title": "Flappy Bird (NES Homebrew)"
  }
}
```

Vieram 3 chaveiros de exemplo, em 2 cores diferentes (`nes` e `snes`), pra
provar que a troca de core funciona:

| keyId            | core | jogo                          |
|-------------------|------|-------------------------------|
| `flappybird-nes`  | nes  | Flappy Bird (homebrew)        |
| `invaders-nes`    | nes  | Invaders (homebrew)           |
| `rockfall-snes`   | snes | Rockfall (homebrew)           |

### Sobre as ROMs

Nada de ROM comercial da Nintendo aqui. As 3 ROMs são homebrew de domínio
livre, carregadas direto do repositório
[`retrobrews/nes-games`](https://github.com/retrobrews/nes-games) e
[`retrobrews/snes-games`](https://github.com/retrobrews/snes-games) (o mesmo
projeto retrobrews citado no briefing) via `raw.githubusercontent.com` — sem
copiar o binário pra este repo.

Os `keyId` (`flappybird-nes`, etc.) são só rótulos mockados do "chaveiro
lido" — troque por `mario-nes`, `sonic-genesis` ou o que fizer sentido pro
seu teste, já que o mapeamento é 100% definido em `config/keychains.json`.

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

## Checklist de validação

Testar em viewport mobile (Chrome DevTools > device toolbar):

- [ ] `/play/:keyId` abre direto no jogo, sem tela de configuração no meio (`EJS_startOnLoaded = true`)
- [ ] Roda liso em mobile
- [ ] Jogar um pouco, salvar save state (menu do EmulatorJS), dar F5 → carrega de onde parou
- [ ] Salvar em `/play/flappybird-nes`, ir em `/play/invaders-nes` → save não vaza entre os dois
- [ ] Conferir o badge de tempo de carregamento no primeiro load (core WASM é pesado)

## Fora de escopo (por enquanto)

- Leitura de NFC (o `keyId` na URL é o mock disso)
- Autenticação/usuário
- Persistência de save state em banco (IndexedDB do navegador é suficiente pra essa validação)

## Nota sobre este ambiente de desenvolvimento

Este código foi escrito num sandbox cujo proxy de rede bloqueia
`cdn.emulatorjs.org` (a CDN pública do EmulatorJS), então não deu pra abrir o
player num browser real e confirmar visualmente o carregamento do core/ROM
e o fluxo de save state aqui dentro. As rotas Express, a separação de config
por `keyId`, a montagem do HTML/CSS e os links das ROMs homebrew (`retrobrews`)
foram conferidos manualmente (`curl`, checagem de CORS/HTTP 200 nas ROMs).
Roda o checklist acima no seu ambiente pra fechar a validação.
