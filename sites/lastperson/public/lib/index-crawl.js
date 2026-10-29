// Public DID discovery: walk com.atproto.sync.listRepos on the public relay.
// This enumerates repositories the relay knows about; it is NOT proof that an
// account is a Bluesky user, is reachable, or is still live. We keep only
// `active: true` repos and record the rest as skipped, so the roster says what
// it is: INDEXED PUBLIC DIDS.
//
// Persisted in IndexedDB (dids + resume cursor + first/last-seen stamps) so a
// reload resumes instead of restarting. No profile, post, or graph fetches.

const RELAYS = ["https://relay1.us-east.bsky.network", "https://bsky.network"];
const DB = "lastperson-index", STORE = "kv";

function idb() {
  return new Promise((res, rej) => {
    const q = indexedDB.open(DB, 1);
    q.onupgradeneeded = () => q.result.createObjectStore(STORE);
    q.onsuccess = () => res(q.result);
    q.onerror = () => rej(q.error);
  });
}
export async function loadIndex() {
  try {
    const db = await idb();
    return await new Promise((res) => {
      const q = db.transaction(STORE).objectStore(STORE).get("index");
      q.onsuccess = () => res(q.result || null);
      q.onerror = () => res(null);
    });
  } catch { return null; }
}
export async function saveIndex(state) {
  try {
    const db = await idb();
    await new Promise((res, rej) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(state, "index");
      tx.oncomplete = res; tx.onerror = () => rej(tx.error);
    });
  } catch { /* storage unavailable: the in-memory index still works */ }
}
export async function clearIndex() {
  try {
    const db = await idb();
    db.transaction(STORE, "readwrite").objectStore(STORE).delete("index");
  } catch { /* ignore */ }
}

async function fetchPage(cursor, signal) {
  let lastErr;
  for (const base of RELAYS) {
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const u = `${base}/xrpc/com.atproto.sync.listRepos?limit=1000` + (cursor ? `&cursor=${encodeURIComponent(cursor)}` : "");
        const r = await fetch(u, { signal });
        if (r.status === 429 || r.status >= 500) throw new Error("http " + r.status);
        if (!r.ok) throw new Error("http " + r.status);
        return await r.json();
      } catch (e) {
        if (e.name === "AbortError") throw e;
        lastErr = e;
        await new Promise((ok) => setTimeout(ok, 500 * 2 ** attempt)); // backoff
      }
    }
  }
  throw lastErr;
}

// Crawl until `target` DIDs are indexed, the relay runs out (cursor empty =
// complete), or the signal aborts. `target` is the visitor's own choice of how
// much to index in this session; the crawl is resumable, so it is a per-click
// budget rather than a ceiling on the index.
export async function crawl(state, target, signal, onProgress) {
  const seen = new Set(state.dids);
  const now = new Date().toISOString();
  state.firstSeen ||= now;
  let sinceSave = 0;
  while (!state.complete && seen.size < target && !signal.aborted) {
    const page = await fetchPage(state.cursor, signal);
    for (const rp of page.repos || []) {
      if (!rp.active) { state.skippedInactive = (state.skippedInactive || 0) + 1; continue; }
      if (!seen.has(rp.did)) { seen.add(rp.did); state.dids.push(rp.did); }
    }
    state.lastSeen = new Date().toISOString();
    if (page.cursor) state.cursor = page.cursor; else state.complete = true;
    onProgress(state);
    if (++sinceSave >= 25) { sinceSave = 0; await saveIndex(state); }
  }
  await saveIndex(state);
  return state;
}

export const emptyIndex = () => ({ dids: [], cursor: "", complete: false, skippedInactive: 0, firstSeen: "", lastSeen: "", source: "com.atproto.sync.listRepos @ relay1.us-east.bsky.network" });
