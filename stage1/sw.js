const CACHE_NAME = 'quiet-pages-v1';
const PRECACHE = [
  './',
  './index.html',
  './index.html?v=1',
  './css/app.css?v=1',
  './js/app.js?v=1',
  './js/crypto.js?v=1',
  './js/db.js?v=1',
  './js/ui.js?v=1',
  './manifest.webmanifest?v=1',
  './icons/icon-192.png?v=1',
  './icons/icon-512.png?v=1',
  './icons/icon-maskable-512.png?v=1',
  './icons/apple-touch-icon.png?v=1',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    (async () => {
      const cached = await caches.match(request);
      if (cached) return cached;
      try {
        const response = await fetch(request);
        if (response && response.ok) {
          const copy = response.clone();
          const cache = await caches.open(CACHE_NAME);
          cache.put(request, copy);
        }
        return response;
      } catch (err) {
        if (request.mode === 'navigate') {
          const fallback = (await caches.match('./index.html')) || (await caches.match('./'));
          if (fallback) return fallback;
        }
        throw err;
      }
    })()
  );
});
