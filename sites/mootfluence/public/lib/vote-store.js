// vote-store.js — an IndexedDB cache of every accepted
// net.bisks.influential25.vote record this browser has derived from the live
// Jetstream firehose or the network-wide backfill, plus its own resume
// cursor. Nothing here is authoritative — it's rebuilt by reconnecting and
// replaying. Copied from sites/influential25/lib/i25-store.js (copy, don't
// abstract) — mootfluence reads the same collection influential25 writes,
// but keeps its own separate index (own origin, own IndexedDB) since it only
// needs read-side tallying, not the nomination-casting UI influential25 has.
//
// Two object stores:
//   votes — every accepted net.bisks.influential25.vote record, keyed by the
//           at:// uri of the record that cast it
//   meta  — small keyed values: the Jetstream resume cursor, backfill state

const DB_NAME = "mootfluence-votes";
const DB_VERSION = 1;

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("votes")) {
        const s = db.createObjectStore("votes", { keyPath: "uri" });
        s.createIndex("voterDid", "voterDid");
        s.createIndex("targetDid", "targetDid");
      }
      if (!db.objectStoreNames.contains("meta")) {
        db.createObjectStore("meta", { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

let dbPromise = null;
function db() {
  if (!dbPromise) dbPromise = openDb();
  return dbPromise;
}

function tx(storeNames, mode) {
  return db().then((d) => d.transaction(storeNames, mode));
}

function reqPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** @param {{uri: string, voterDid: string, targetDid: string, createdAtMs: number}} rec */
export async function putVote(rec) {
  const t = await tx(["votes"], "readwrite");
  t.objectStore("votes").put(rec);
  return new Promise((res, rej) => {
    t.oncomplete = () => res();
    t.onerror = () => rej(t.error);
  });
}

export async function allVotes() {
  const t = await tx(["votes"], "readonly");
  return reqPromise(t.objectStore("votes").getAll());
}

export async function getMeta(key) {
  const t = await tx(["meta"], "readonly");
  const row = await reqPromise(t.objectStore("meta").get(key));
  return row ? row.value : undefined;
}

export async function setMeta(key, value) {
  const t = await tx(["meta"], "readwrite");
  t.objectStore("meta").put({ key, value });
  return new Promise((res, rej) => {
    t.oncomplete = () => res();
    t.onerror = () => rej(t.error);
  });
}
