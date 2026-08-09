// Service worker: existe por dois motivos.
// 1. Sem um SW com handler de fetch, o Chrome não dispara `beforeinstallprompt`
//    — ou seja, o botão "Instalar app" simplesmente não apareceria.
// 2. Cache-first nos assets pesados (capas, ROMs, css/js) deixa a segunda
//    visita praticamente instantânea, que é metade da sensação de "rápido".
//
// Só mexe em same-origin. As requisições pro CDN do EmulatorJS passam direto
// pro navegador — resposta opaca de terceiro em cache dá mais dor de cabeça
// (tamanho, revalidação) do que ganho, e o cache HTTP normal já cobre isso.

const VERSION = "myde-v6";
const SHELL_CACHE = `${VERSION}-shell`;
const ASSET_CACHE = `${VERSION}-assets`;

// "/" fica de fora de propósito: com o acesso restrito ligado, um visitante
// sem convite receberia a tela de "acesso por convite" e ela é que ficaria
// gravada como a home. O handler de navegação já guarda a home de verdade
// depois de uma visita bem-sucedida.
const SHELL = [
  "/css/style.css",
  "/js/library.js",
  "/js/player.js",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      // addAll falha inteiro se um item falhar; um asset ausente não pode
      // impedir o SW de instalar, então cada um vai por conta própria.
      .then((cache) => Promise.allSettled(SHELL.map((url) => cache.add(url))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

// Capa, ROM e ícone nunca mudam de conteúdo debaixo do mesmo nome de arquivo
// (cada jogo novo ganha um arquivo novo) — cache-first é seguro e é o que dá
// a sensação instantânea na segunda visita.
function isImmutableAsset(url) {
  return (
    url.pathname.startsWith("/covers/") ||
    url.pathname.startsWith("/roms/") ||
    url.pathname.startsWith("/icons/")
  );
}

// css/js mudam a CADA deploy de código. Já tentamos stale-while-revalidate
// aqui (serve o cache na hora, atualiza em paralelo) e o resultado prático
// foi pior que o problema: toda visita logo depois de um deploy rodava com
// HTML novo + JS ainda VELHO por baixo — página carregava, jogo escolhido não
// iniciava, ou iniciava com um bug já corrigido — e só a SEGUNDA carga (ou
// uma guia anônima, sem cache nenhum) pegava a versão certa. Rede primeiro
// resolve isso na raiz: sempre busca o arquivo atual quando há internet, e
// só cai pro cache se a rede falhar (fica só o offline como motivo de usar
// cache aqui, não velocidade).
function isRevalidatingAsset(url) {
  return url.pathname.startsWith("/css/") || url.pathname.startsWith("/js/");
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Nada de admin, resgate de link ou API entra em cache: são respostas que
  // dependem de sessão e de estado do servidor. Servir uma cópia velha delas
  // furaria justamente o controle de acesso.
  if (
    url.pathname.startsWith("/admin") ||
    url.pathname.startsWith("/t/") ||
    url.pathname.startsWith("/api/")
  ) {
    return;
  }

  // Assets imutáveis: serve do cache na hora, busca na rede só se faltar.
  if (isImmutableAsset(url)) {
    event.respondWith(
      caches.match(req).then((hit) => {
        if (hit) return hit;
        return fetch(req).then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(ASSET_CACHE).then((c) => c.put(req, copy));
          }
          return res;
        });
      })
    );
    return;
  }

  // css/js: rede primeiro, sempre — mesmo raciocínio do HTML logo abaixo.
  // Cache só entra como rede de segurança se a rede falhar (offline).
  if (isRevalidatingAsset(url)) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(ASSET_CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // HTML: rede primeiro (pra não servir catálogo velho), cache como rede de
  // segurança offline.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL_CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match("/")))
    );
  }
});
