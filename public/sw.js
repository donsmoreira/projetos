// Service worker do Razão Finance ARC (app instalável).
//
// Não guarda dados financeiros nem as telas do sistema: tudo continua vindo
// da internet, então cada versão nova publicada já chega na hora.
// A única coisa guardada é a página "Sem conexão", mostrada quando o celular
// está sem internet ao abrir o app.

const CACHE = "razao-finance-offline-v1";
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.add(new Request(OFFLINE_URL, { cache: "reload" })))
  );
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))
    )
  );
  self.clients.claim();
});

// Só as aberturas de tela passam por aqui; se a internet falhar, mostra "Sem conexão".
self.addEventListener("fetch", event => {
  if (event.request.mode !== "navigate") {
    return;
  }

  event.respondWith(
    fetch(event.request).catch(() =>
      caches.match(OFFLINE_URL).then(response => response || Response.error())
    )
  );
});
