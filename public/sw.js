// Service worker: existe por dois motivos.
// 1. Sem um SW com handler de fetch, o Chrome não dispara `beforeinstallprompt`
//    — ou seja, o botão "Instalar app" simplesmente não apareceria.
// 2. Cache-first nos assets pesados (capas, ROMs, css/js) deixa a segunda
//    visita praticamente instantânea, que é metade da sensação de "rápido".
//
// Só mexe em same-origin. As requisições pro CDN do EmulatorJS passam direto
// pro navegador — resposta opaca de terceiro em cache dá mais dor de cabeça
// (tamanho, revalidação) do que ganho, e o cache HTTP normal já cobre isso.

const VERSION = "myde-v5";
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

// css/js mudam a CADA deploy de código. Cache-first puro aqui já deixou
// visitante recorrente preso num library.js velho depois de um deploy — a
// tela carregava, mas os botões novos (ex.: o ícone de ver todos os jogos)
// não faziam nada, porque o JS debaixo do HTML novo ainda era o de antes.
// stale-while-revalidate: serve o que tem em cache na hora (mesma
// velocidade), mas já dispara a busca da versão nova em paralelo e atualiza
// o cache — a PRÓXIMA carga já vem corrigida sozinha, sem precisar lembrar
// de trocar o VERSION a cada deploy.
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

  // css/js: serve do cache na hora (rápido) e atualiza em segundo plano
  // (correto na próxima carga), em vez de ficar preso numa versão só porque
  // ninguém lembrou de trocar o VERSION.
  if (isRevalidatingAsset(url)) {
    event.respondWith(
      caches.open(ASSET_CACHE).then((cache) =>
        cache.match(req).then((hit) => {
          const network = fetch(req)
            .then((res) => {
              if (res && res.ok) cache.put(req, res.clone());
              return res;
            })
            .catch(() => hit);
          return hit || network;
        })
      )
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
