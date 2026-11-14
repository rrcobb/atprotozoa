// cache.js — keeps the crawled posts in IndexedDB so a return visit only fetches what's new.
// Everything fails soft: no IndexedDB (private mode) just means a full crawl every time.
const DB = "banhmi-contagion", STORE = "kv", KEY = "crawl-v1";

function open() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

// -> { posts, at, terms } or null
export async function loadCache() {
  try {
    const db = await open();
    return await new Promise((res) => {
      const q = db.transaction(STORE).objectStore(STORE).get(KEY);
      q.onsuccess = () => res(q.result || null);
      q.onerror = () => res(null);
    });
  } catch { return null; }
}

export async function saveCache(posts, at, terms) {
  try {
    const db = await open();
    db.transaction(STORE, "readwrite").objectStore(STORE).put({ posts, at, terms }, KEY);
  } catch { /* cache is an optimization only */ }
}
