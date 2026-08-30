// timelane service worker — makes the app installable and usable fully
// offline. Recipe adapted from sites/commonplace/public/sw.js. Unlike
// commonplace, timelane has NO server-rendered routes and NO cross-origin
// fetches at all (no PDS, no AppView, no OAuth) — every route is a static
// asset and every byte of app data lives in localStorage, so this can be a
// straightforward cache-first app shell with no "don't cache live data"
// carve-out to worry about.

const CACHE_VERSION = "v2";
const CACHE_NAME = `timelane-${CACHE_VERSION}`;

const PRECACHE_URLS = [
  "/",
  "/manifest.json",
  "/style.css",
  "/lib/storage.js",
  "/lib/model.js",
  "/lib/markdown.js",
  "/lib/share.js",
  "/lib/dates.js",
  "/app.js",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png",
  "/icons/apple-touch-icon.png",
  "/og.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Navigations: cache-first with a background revalidate, falling back to
  // the cached app shell "/" when fully offline and this exact path was
  // never cached (a fresh deep link with no connectivity).
  if (req.mode === "navigate") {
    event.respondWith(
      caches.match(req).then((cached) => {
        const network = fetch(req)
          .then((res) => {
            caches.open(CACHE_NAME).then((cache) => cache.put(req, res.clone()));
            return res;
          })
          .catch(() => cached || caches.match("/"));
        return cached || network;
      }),
    );
    return;
  }

  // Same-origin static assets: stale-while-revalidate.
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res.ok) caches.open(CACHE_NAME).then((cache) => cache.put(req, res.clone()));
          return res;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
