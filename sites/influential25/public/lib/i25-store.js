// i25-store.js — Influential25's entire "backend": an IndexedDB cache of every
// accepted nomination i25-client.js has derived from the live Jetstream
// firehose or the network-wide backfill, plus its own resume cursor. Nothing
// here is authoritative — it's rebuilt by reconnecting and replaying, same
// shape as sites/socialcredit's sc-store.js (notes/00, notes/40:
// frontend-first, no Durable Object, no KV).
//
// Two object stores:
//   votes — every accepted net.bisks.influential25.vote record, keyed by the
//           at:// uri of the record that cast it
//   meta  — small keyed values: the Jetstream resume cursor, backfill state

const DB_NAME = "influential25-store";
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

/** @param {{uri: string, voterDid: string, targetDid: string, createdAtMs: number, source: string}} rec */
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
