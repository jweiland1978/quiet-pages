const CACHE_NAME = 'quiet-pages-demo-v4';
const PRECACHE = [
  './',
  './index.html',
  './index.html?v=4',
  './privacy.html',
  './privacy.html?v=4',
  './css/app.css?v=4',
  './js/app.js?v=4',
  './js/crypto.js?v=4',
  './js/db.js?v=4',
  './js/ui.js?v=4',
  './js/calendar.js?v=4',
  './js/search.js?v=4',
  './js/backup.js?v=4',
  './js/settings.js?v=4',
  './js/autolock.js?v=4',
  './js/edition.js?v=4',
  './manifest.webmanifest?v=4',
  './icons/icon-192.png?v=4',
  './icons/icon-512.png?v=4',
  './icons/icon-maskable-512.png?v=4',
  './icons/apple-touch-icon.png?v=4',
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
