// inference-clicker service worker — makes the game installable and playable
// offline. Navigations (including the OAuth redirect back to "/" carrying
// ?code=&state=) go network-first with the cache as the offline fallback;
// same-origin static files are stale-while-revalidate; cross-origin requests
// (the player's PDS, plc.directory) are never intercepted because DPoP-bound
// fetches have to reach the network untouched.

const CACHE = "inference-clicker-v2";
const PRECACHE = [
  "/",
  "/style.css",
  "/manifest.json",
  "/lib/app.js",
  "/lib/game.js",
  "/lib/cast.js",
  "/lib/pds.js",
  "/lib/oauth.js",
  "/lib/oauth-jwt.js",
  "/lib/handle-typeahead.js",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put("/", copy));
          return res;
        })
        .catch(() => caches.match("/")),
    );
    return;
  }
  e.respondWith(
    caches.match(req).then((hit) => {
      const net = fetch(req)
        .then((res) => {
          if (res.ok) caches.open(CACHE).then((c) => c.put(req, res.clone()));
          return res;
        })
        .catch(() => hit);
      return hit || net;
    }),
  );
});
