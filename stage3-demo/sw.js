const CACHE_NAME = 'quiet-pages-demo-v3';
const PRECACHE = [
  './',
  './index.html',
  './index.html?v=3',
  './privacy.html',
  './privacy.html?v=3',
  './css/app.css?v=3',
  './js/app.js?v=3',
  './js/crypto.js?v=3',
  './js/db.js?v=3',
  './js/ui.js?v=3',
  './js/calendar.js?v=3',
  './js/search.js?v=3',
  './js/backup.js?v=3',
  './js/settings.js?v=3',
  './js/autolock.js?v=3',
  './js/edition.js?v=3',
  './manifest.webmanifest?v=3',
  './icons/icon-192.png?v=3',
  './icons/icon-512.png?v=3',
  './icons/icon-maskable-512.png?v=3',
  './icons/apple-touch-icon.png?v=3',
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
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
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
