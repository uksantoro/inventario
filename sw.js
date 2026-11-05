// Service worker minimo: rende l'app installabile e tiene una copia della pagina per aprirla anche senza rete.
// I dati (api/) non vengono mai messi in cache.
const V = "sl-v1";
const FILES = ["./", "index.html", "config.js", "icon-192.png", "icon-512.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(V).then(c => c.addAll(FILES).catch(() => {})).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== V).map(x => caches.delete(x)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== "GET" || u.origin !== location.origin || u.pathname.startsWith("/api/")) return;
  e.respondWith(fetch(r).then(res => { if (res.ok) { const c = res.clone(); caches.open(V).then(x => x.put(r, c)); } return res; }).catch(() => caches.match(r).then(m => m || caches.match("index.html"))));
});
