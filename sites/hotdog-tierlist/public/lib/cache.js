// cache.js — remembers per-image verdicts in the visitor's own IndexedDB.
// Bluesky image URLs are content-addressed (the CID is in the path), so a
// verdict for a URL never goes stale; re-running a cluster skips every photo
// already judged. Any failure (private mode, quota) degrades to "no cache".

const DB = "hotdog-tierlist";
const STORE = "images";
let dbp = null;

function open() {
  if (!dbp) {
    dbp = new Promise((resolve) => {
      try {
        const req = indexedDB.open(DB, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }
  return dbp;
}

export async function cacheGet(key) {
  const db = await open();
  if (!db) return undefined;
  return new Promise((resolve) => {
    try {
      const r = db.transaction(STORE).objectStore(STORE).get(key);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => resolve(undefined);
    } catch {
      resolve(undefined);
    }
  });
}

export async function cacheSet(key, value) {
  const db = await open();
  if (!db) return;
  try {
    db.transaction(STORE, "readwrite").objectStore(STORE).put(value, key);
  } catch {
    // ignore
  }
}

// cdn.bsky.app has no CORS headers; the Worker's /img/* route re-serves it
// same-origin so pixels can be read.
export function proxied(url) {
  const pre = "https://cdn.bsky.app/img/";
  return url.startsWith(pre) ? "/img/" + url.slice(pre.length) : url;
}
