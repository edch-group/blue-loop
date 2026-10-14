// Offline support for the web app. Every file the game is made of is cached on install (the build fills in the
// list and the version: vite.config.ts), so after a first visit the whole game runs offline. Built assets have
// hashed names, so they are served cache-first; the page itself is network-first so updates arrive.
self.__PRECACHE = [];
const CACHE = 'blue-loop-dev';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      // (One by one: a file that fails to come is fetched again when it is next asked for.)
      .then((c) => Promise.all(self.__PRECACHE.map((url) => c.add(url).catch(() => undefined))))
      .then(() => self.skipWaiting()),
  );
});
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  // The account API is always live (never served from the cache).
  if (url.pathname.startsWith('/api/')) return;
  // The Unity game (/play/) caches its own build: never held here.
  if (url.pathname.startsWith('/play/')) return;
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || caches.match('./'))),
    );
    return;
  }
  event.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        }),
    ),
  );
});
