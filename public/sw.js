// Service worker: existe por dois motivos.
// 1. Sem um SW com handler de fetch, o Chrome não dispara `beforeinstallprompt`
//    — ou seja, o botão "Instalar app" simplesmente não apareceria.
// 2. Cache-first nos assets pesados (capas, ROMs, css/js) deixa a segunda
//    visita praticamente instantânea, que é metade da sensação de "rápido".
//
// Só mexe em same-origin. As requisições pro CDN do EmulatorJS passam direto
// pro navegador — resposta opaca de terceiro em cache dá mais dor de cabeça
// (tamanho, revalidação) do que ganho, e o cache HTTP normal já cobre isso.

const VERSION = "retro-v3";
const SHELL_CACHE = `${VERSION}-shell`;
const ASSET_CACHE = `${VERSION}-assets`;

const SHELL = [
  "/",
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

function isCacheableAsset(url) {
  return (
    url.pathname.startsWith("/covers/") ||
    url.pathname.startsWith("/roms/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname.startsWith("/css/") ||
    url.pathname.startsWith("/js/")
  );
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Assets imutáveis: serve do cache na hora, busca na rede só se faltar.
  if (isCacheableAsset(url)) {
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
