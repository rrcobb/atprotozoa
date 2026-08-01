// commonplace service worker — makes the composer installable as a PWA and
// usable offline for the app shell. Kept deliberately simple:
//
//   - navigations (HTML page loads, incl. the OAuth redirect back to "/" and
//     the server-rendered /read/<did>/<rkey> + /pub/<handle> routes) are
//     network-first. Those routes carry live PDS data (or, for "/", an OAuth
//     ?code=&state= to process) — serving a stale cached copy first would be
//     actively wrong, not just outdated. Cache is only a last-resort offline
//     fallback.
//   - same-origin static assets (icons, oauth libs, manifest) are
//     stale-while-revalidate — instant from cache, refreshed in the background.
//   - cross-origin requests (PDS, plc.directory, bsky API) are never
//     intercepted; DPoP-bound fetches need to hit the network directly.

const CACHE_VERSION = "v1";
const CACHE_NAME = `commonplace-${CACHE_VERSION}`;

const PRECACHE_URLS = [
  "/",
  "/manifest.json",
  "/lib/oauth.js",
  "/lib/oauth-jwt.js",
  "/lib/atproto.js",
  "/lib/blob.js",
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

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((cached) => cached || caches.match("/"))),
    );
    return;
  }

  event.respondWith(
    caches.open(CACHE_NAME).then((cache) =>
      cache.match(req).then((cached) => {
        const fetchPromise = fetch(req)
          .then((res) => {
            if (res.ok) cache.put(req, res.clone());
            return res;
          })
          .catch(() => cached);
        return cached || fetchPromise;
      }),
    ),
  );
});
