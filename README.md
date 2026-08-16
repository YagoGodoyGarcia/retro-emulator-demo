# MYDE

Console retro que roda 100% no navegador: vitrine em tela cheia, jogos que
abrem em um toque, e acesso por link exclusivo (pensado pra QR code). Sem
framework — Express no servidor, DOM e CSS no cliente.

## Stack

- **Servidor:** Node.js + Express (`server.js`, `api/index.js` pro deploy serverless)
- **Cliente:** HTML/CSS/JS puro, sem build step
- **Emulação:** [EmulatorJS](https://emulatorjs.org/) (cores NES, SNES, GBA, Mega Drive)
- **Armazenamento:** Redis (Vercel KV/Upstash) para links e catálogo; Vercel Blob para upload de ROM em produção
- **PWA:** service worker com cache-first para assets estáticos

## Rodando local

```bash
npm install
cp .env.example .env   # opcional, os defaults já funcionam
npm start
```

Abre em `http://localhost:3000`.

## Rotas

| Rota | Descrição |
|---|---|
| `GET /` | Carteira/vitrine de jogos da sessão atual |
| `GET /play/:id` | Player em tela cheia; admin pode testar qualquer jogo publicado |
| `GET /c/:id` | Link público do jogador; primeiro acesso abre o cadastro por nome |
| `POST /c/:id/claim` | Cadastra nome/e-mail opcional e atribui o jogo do link |
| `GET /t/:token` | Resgate do link de convite tradicional (vincula ao aparelho) |
| `GET /admin` | Painel de administração (senha obrigatória) |
| `GET /admin/api/access-report` | Relatório de cadastros, acessos e partidas |
| `GET /api/keychains` | Catálogo JSON filtrado pela carteira atual |

## Estrutura

- `server.js` — rotas e HTML
- `lib/access.js` — cookies, vínculo de aparelho, sessão
- `lib/store.js` — armazenamento dos links de acesso
- `lib/library-store.js` — catálogo dos jogos adicionados pelo admin
- `lib/blob.js` — armazenamento do arquivo de ROM/capa
- `lib/game-entry.js` — validação de upload
- `lib/redis.js` — cliente Redis compartilhado
- `lib/gamepad.js` — layout do controle virtual por core
- `public/js/library.js` — lógica da vitrine (busca, sugestão, carrossel)
- `public/js/player.js` — lógica do player
- `public/js/admin.js` — painel admin
- `public/sw.js` — service worker (cache/PWA)
- `config/keychains.json` — catálogo estático de jogos

## Configuração (variáveis de ambiente)

| Variável | Para quê |
|---|---|
| `PORT` | Porta do servidor local (padrão 3000) |
| `PUBLIC_ORIGIN` | URL canônica sem barra final para links e QR codes do painel; recomendada em produção |
| `ACCESS_MODE` | `open` (padrão) ou `locked` (exige link de convite) |
| `ADMIN_PASSWORD` | Senha do painel `/admin` |
| `ACCESS_SECRET` | Segredo fixo para assinar cookies de sessão — gere com `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | Redis (Vercel KV/Upstash) — obrigatório em produção para persistir links |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob — necessário para upload de ROM funcionar em produção |
| `EMULATORJS_CDN_URL` | CDN do EmulatorJS (padrão: `https://cdn.emulatorjs.org/4.2.3/data/`) |
| `GAMEURL_<ID>` | Override pontual da ROM de um jogo sem editar o JSON |

Veja `.env.example` para o arquivo completo comentado.

O painel administrativo usa um token CSRF assinado, enviado por header nas operações que alteram dados. Em produção, defina `PUBLIC_ORIGIN` com o domínio oficial para que links e QR codes não dependam de headers de proxy encaminhados pela requisição.

## Deploy na Vercel

Repo pronto para zero-config: `api/index.js` exporta o app Express e
`vercel.json` reescreve as rotas pra essa function.

1. Importar o repo na Vercel (New Project → Import Git Repository)
2. Configurar as variáveis de ambiente da tabela acima
3. Ativar Storage → Blob (preenche `BLOB_READ_WRITE_TOKEN` automaticamente) se quiser permitir upload de ROM pelo admin

## Links públicos e carteira de jogos

O painel `/admin` gera um link por pessoa e permite escolher o jogo que será
entregue. O link pode ser enviado por WhatsApp, e-mail ou QR code. Na primeira
abertura, a pessoa informa apenas o nome e, se quiser, o e-mail. O servidor cria
a carteira, atribui o jogo escolhido e redireciona para a biblioteca dela; o
mesmo jogo pode ser compartilhado por várias carteiras sem misturar os acessos.

O link `/c/:id` funciona como uma credencial privada: deve ser enviado somente
à pessoa destinada. O cookie de sessão é assinado e `HttpOnly`, e o admin pode
revogar ou apagar o link. O painel também mostra o último acesso, quantidade de
partidas e eventos recentes. O fluxo antigo `/t/:token` continua separado e
vincula o convite a um aparelho.

Isso é proteção de **experiência**, não DRM — as ROMs continuam acessíveis
por URL direta.

## Adicionando um jogo

### Editando o catálogo estático

Adicione uma entrada em `config/keychains.json`:

```json
{
  "meu-jogo-nes": {
    "core": "nes",
    "gameUrl": "/roms/meu-jogo.nes",
    "gameId": "meu-jogo-nes",
    "title": "Meu Jogo",
    "genre": "Plataforma",
    "cover": "meu-jogo-nes.png",
    "tags": ["palavra-chave"],
    "featured": false
  }
}
```

`core` aceita `nes`, `snes`, `gba` ou `segaMD`. Opcionalmente, `"gamepad": "segaMD6"`
troca o controle de 3 pros 6 botões (X/Y/Z) do Mega Drive — útil pra jogo de
luta; sem esse campo usa o padrão dos 3 botões do console. `cover` é o nome do arquivo em
`public/covers/`. `featured: true` promove o jogo a destaque na vitrine.

### Pelo painel `/admin`

Segunda seção do admin: título, gênero, console, tags, arquivo da ROM e
capa. Requer **Vercel Blob configurado** em produção (`BLOB_READ_WRITE_TOKEN`)
— sem isso o formulário fica desabilitado e a rota recusa com 503. Local
(`npm start`) sempre funciona, gravando em `public/roms/private/` e
`public/covers/private/`.

**Limites:** ROM até 4MB, capa até 1.5MB. Extensão precisa bater com o
console escolhido (`.nes`, `.sfc`/`.smc`, `.gba`, `.bin`/`.md`/`.gen`).

### Sobre direitos autorais das ROMs

Este repositório é **público** e o `main` publica automaticamente na Vercel
a cada push — qualquer arquivo commitado vira distribuição pública, indexável
e baixável por qualquer pessoa. Por isso:

- Apenas ROMs **homebrew**, de **domínio público**, ou que você tem o direito
  explícito de redistribuir podem ser commitadas no repositório.
- ROMs comerciais (Nintendo, Sega, etc.) **nunca** entram aqui, mesmo que você
  possua o cartucho original — posse pessoal não equivale a direito de
  distribuição pública.
- O checkbox de confirmação de direitos no formulário de upload é obrigatório
  por esse motivo.

Para testar uma ROM própria **só na sua máquina**, sem publicar nada, use a
pasta `public/roms/private/` (já está no `.gitignore`) e aponte `gameUrl`
para ela no seu `config/keychains.json` local — não faça commit dessa
alteração.

## Inicialização e desempenho no celular

O player usa o CDN versionado do EmulatorJS para manter loader, core e cache na mesma versão. A vitrine pré-carrega apenas a ROM no celular; o core comprimido fica para a tela do player, evitando concorrência durante a navegação. O botão nativo `START GAME` inicia o jogo dentro de um gesto real do usuário, necessário para o áudio e o primeiro frame no Chrome do iPhone. Depois do gesto inicial, o player aplica o fluxo específico do Mega Drive para sair do título do Sonic e entrar em 1 Player. Salvar e carregar ficam em um menu compacto, e o cache do service worker e os assets são versionados para aplicar atualizações sem F5.

## Save state

Salvo automaticamente no **IndexedDB do navegador** via EmulatorJS —
sem backend. Cada jogo usa seu próprio `EJS_gameID` (o `keyId`), então saves
não se misturam entre jogos.

## Troubleshooting

**Tela do jogo fica cinza e nunca carrega:** geralmente é a ROM não
terminando de baixar. Abra o DevTools (F12) → Console e Network, e confirme
se `GET /roms/<arquivo>` voltou 200.

## Fora de escopo (por enquanto)

- Leitura de NFC (o `/t/:token` já é o destino que a tag apontaria)
- Senha ou login externo; o produto usa link privado e cadastro leve
- Save state em banco de dados (o IndexedDB do navegador cobre esta fase)
