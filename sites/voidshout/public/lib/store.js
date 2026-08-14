// store.js — the Void's entire "backend": an IndexedDB cache of whatever
// ingest.js has validated off the live Jetstream firehose (plus its own
// wall-clock cursor and an audit log of what it rejected). Nothing here is
// authoritative — every table is rebuildable by reconnecting and replaying,
// which is the whole point of the house rule against a real backend
// (notes/00, notes/40): this is "frontend-first," not "frontend-only
// pretending to have a database."
//
// Three object stores:
//   records — every valid net.bisks.void.* record seen, keyed by at:// uri
//   audit   — every record ingest.js rejected, with why
//   meta    — small keyed values: the Jetstream cursor, admin counters

const DB_NAME = "voidshout-store";
const DB_VERSION = 1;

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("records")) {
        const s = db.createObjectStore("records", { keyPath: "uri" });
        s.createIndex("collection", "collection");
        s.createIndex("did", "did");
      }
      if (!db.objectStoreNames.contains("audit")) {
        const s = db.createObjectStore("audit", { keyPath: "id", autoIncrement: true });
        s.createIndex("uri", "uri");
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

// ---- records ------------------------------------------------------------

/** @param {{uri: string, collection: string, did: string, rkey: string, value: object, ingestedAtMs: number}} rec */
export async function putRecord(rec) {
  const t = await tx(["records"], "readwrite");
  t.objectStore("records").put(rec);
  return new Promise((res, rej) => {
    t.oncomplete = () => res();
    t.onerror = () => rej(t.error);
  });
}

export async function deleteRecordByUri(uri) {
  const t = await tx(["records"], "readwrite");
  t.objectStore("records").delete(uri);
  return new Promise((res, rej) => {
    t.oncomplete = () => res();
    t.onerror = () => rej(t.error);
  });
}

export async function getRecord(uri) {
  const t = await tx(["records"], "readonly");
  return reqPromise(t.objectStore("records").get(uri));
}

export async function allRecords() {
  const t = await tx(["records"], "readonly");
  return reqPromise(t.objectStore("records").getAll());
}

export async function recordsByCollection(collection) {
  const t = await tx(["records"], "readonly");
  return reqPromise(t.objectStore("records").index("collection").getAll(collection));
}

export async function recordsByDid(did) {
  const t = await tx(["records"], "readonly");
  return reqPromise(t.objectStore("records").index("did").getAll(did));
}

// ---- audit ----------------------------------------------------------------

/** @param {{uri: string, collection: string, reason: string, did: string, atMs: number}} entry */
export async function putAudit(entry) {
  const t = await tx(["audit"], "readwrite");
  t.objectStore("audit").add(entry);
  return new Promise((res, rej) => {
    t.oncomplete = () => res();
    t.onerror = () => rej(t.error);
  });
}

export async function allAudit() {
  const t = await tx(["audit"], "readonly");
  const rows = await reqPromise(t.objectStore("audit").getAll());
  return rows.sort((a, b) => b.atMs - a.atMs);
}

// ---- meta -----------------------------------------------------------------

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

// ---- purge (used after a successful "leave the Void" cascade) -------------
// Removes one DID's derived footprint from the local cache. This is a LOCAL
// purge only — the whole point of "derived state is rebuildable" is that
// deleting it here is safe precisely because it isn't a source of truth;
// reconnecting to Jetstream simply won't see that DID's records anymore
// once they're really gone from their PDS.

export async function purgeDid(did) {
  const mine = await recordsByDid(did);
  const t = await tx(["records"], "readwrite");
  const store = t.objectStore("records");
  for (const r of mine) store.delete(r.uri);
  return new Promise((res, rej) => {
    t.oncomplete = () => res();
    t.onerror = () => rej(t.error);
  });
}
