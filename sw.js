// Service worker : rend le site installable et utilisable hors ligne.
// - Fichiers du site (HTML, CSS, JS, données) : réseau d'abord, cache en secours -> les mises à jour arrivent tout de suite.
// - Images du jeu : cache d'abord (elles ne changent pas), téléchargées à la première consultation.
const VERSION = 'v2';
const SHELL = `shell-${VERSION}`;
const IMAGES = 'images-v1';
const SHELL_FILES = [
  './',
  'index.html',
  'assets/style.css',
  'assets/app.js',
  'data/game-data.js',
  'data/images.js',
  'manifest.webmanifest',
  'assets/icons/icon-192.png',
  'assets/icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL && k !== IMAGES).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // polices Google : laissées au navigateur

  if (url.pathname.includes('/assets/img/')) {
    e.respondWith(
      caches.open(IMAGES).then(async (c) => {
        const hit = await c.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) c.put(req, res.clone());
        return res;
      })
    );
    return;
  }

  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(SHELL).then((c) => c.put(req, copy)); }
        return res;
      })
      .catch(async () => (await caches.match(req)) || (req.mode === 'navigate' ? caches.match('index.html') : Response.error()))
  );
});
