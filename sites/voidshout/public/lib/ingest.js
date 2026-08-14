// ingest.js — the Void's only "backend": a live Jetstream subscription that
// validates every net.bisks.void.* commit anyone on the network publishes
// and folds the valid ones into store.js. Runs in every visitor's browser
// independently (frontend-first, notes/00 + notes/40 — no Durable Object,
// no KV, no server aggregation). Two visitors' local caches can differ
// slightly by how much backfill each has pulled, but both are honest
// projections of the same public repos, and both are fully rebuildable by
// reconnecting — that's the "idempotent, rebuildable derived state" the
// brief asked for, just paid for in client CPU instead of a database.
//
// Cross-record rules live here (not in voidlogic.mjs) because they need
// "what's already in the store" — voidlogic.mjs only exports the pure
// predicates (cooldownOk, isDuplicateRoot) that this file calls. The core
// validate-and-commit path (handleCreateOrUpdate) is module-level, not
// nested in startIngest(), so a page can also feed it ONE externally-fetched
// record (ingestOne, below) — e.g. shout/ resolving a just-shared link the
// live socket hasn't happened past yet, or import/ reflecting a freshly
// written record immediately instead of waiting on the firehose round trip.

import {
  COLLECTIONS,
  ALL_COLLECTIONS,
  validateRecord,
  cooldownOk,
  isDuplicateRoot,
  ORPHAN_RETRY_LIMIT,
} from "./voidlogic.mjs";
import * as store from "./store.js";

const JETSTREAM_HOSTS = [
  "jetstream1.us-east.bsky.network",
  "jetstream2.us-east.bsky.network",
  "jetstream1.us-west.bsky.network",
  "jetstream2.us-west.bsky.network",
];
const BACKFILL_MS = 24 * 3600 * 1000; // how far back a first-ever visit backfills

function jetstreamUrl(host, cursorUs) {
  const wanted = ALL_COLLECTIONS.map((c) => `wantedCollections=${encodeURIComponent(c)}`).join("&");
  const cursor = cursorUs != null ? `&cursor=${cursorUs}` : "";
  return `wss://${host}/subscribe?${wanted}${cursor}`;
}

function atUri(did, collection, rkey) {
  return `at://${did}/${collection}/${rkey}`;
}

// Pending echoes/murmurs/votes whose parent/subject hasn't arrived yet,
// keyed by the uri they're waiting on. Re-attempted whenever that uri gets
// stored, and swept on a timer so a dependency that never arrives eventually
// resolves to an "orphan-parent" audit entry instead of waiting forever.
const pendingByDependency = new Map(); // depUri -> [{item, tries}]

function addPending(depUri, item) {
  const list = pendingByDependency.get(depUri) || [];
  list.push({ item, tries: 0 });
  pendingByDependency.set(depUri, list);
}

// Module-level listener sets. startIngest() adds/removes its callbacks here
// so ingestOne() (called from outside any particular socket's lifetime)
// still notifies whichever page is listening.
const listeners = { onRecord: new Set(), onAudit: new Set(), onDelete: new Set() };

async function reject(uri, collection, did, reason) {
  const entry = { uri, collection, reason, did, atMs: Date.now() };
  await store.putAudit(entry);
  for (const fn of listeners.onAudit) fn(entry);
}

async function commit(uri, collection, did, rkey, value) {
  const rec = { uri, collection, did, rkey, value, ingestedAtMs: Date.now() };
  await store.putRecord(rec);
  for (const fn of listeners.onRecord) fn(rec);
  await resolvePendingFor(uri);
}

async function tryResolveAndApply(collection, did, rkey, value, uri) {
  switch (collection) {
    case COLLECTIONS.shout: {
      const priorRaw = await store.recordsByDid(did);
      const priorShouts = priorRaw
        .filter((r) => r.collection === COLLECTIONS.shout && r.uri !== uri)
        .map((r) => ({ text: r.value.text, createdAtMs: Date.parse(r.value.createdAt) }));
      if (isDuplicateRoot(priorShouts, value.text, Date.parse(value.createdAt))) {
        return reject(uri, collection, did, "duplicate-root");
      }
      return commit(uri, collection, did, rkey, value);
    }
    case COLLECTIONS.echo:
    case COLLECTIONS.murmur: {
      const parent = await store.getRecord(value.parentUri);
      if (!parent) return { pending: value.parentUri };
      const priorRaw = await store.recordsByDid(did);
      const priorCarries = priorRaw.filter(
        (r) =>
          (r.collection === COLLECTIONS.echo || r.collection === COLLECTIONS.murmur) &&
          r.value.rootUri === value.rootUri &&
          r.uri !== uri,
      );
      const lastAt = priorCarries.length
        ? Math.max(...priorCarries.map((r) => Date.parse(r.value.createdAt)))
        : undefined;
      if (!cooldownOk(lastAt, Date.parse(value.createdAt))) {
        return reject(uri, collection, did, "echo-cooldown");
      }
      return commit(uri, collection, did, rkey, value);
    }
    case COLLECTIONS.vote: {
      const subject = await store.getRecord(value.subjectUri);
      if (!subject) return { pending: value.subjectUri };
      if (subject.did === did) return reject(uri, collection, did, "self-vote");
      return commit(uri, collection, did, rkey, value);
    }
    case COLLECTIONS.participation:
      return commit(uri, collection, did, rkey, value);
    default:
      return reject(uri, collection, did, "invalid-schema");
  }
}

async function handleCreateOrUpdate(collection, did, rkey, value, priorTries = 0) {
  const uri = atUri(did, collection, rkey);
  if (await store.getRecord(uri)) return; // already applied — idempotent replay

  const shapeCheck = validateRecord(collection, value);
  if (!shapeCheck.ok) {
    return reject(uri, collection, did, shapeCheck.reason);
  }

  const result = await tryResolveAndApply(collection, did, rkey, value, uri);
  if (result && result.pending) {
    const tries = priorTries + 1;
    if (tries > ORPHAN_RETRY_LIMIT) {
      return reject(uri, collection, did, "orphan-parent");
    }
    addPending(result.pending, { item: { collection, did, rkey, value }, tries });
  }
}

async function resolvePendingFor(depUri) {
  const waiters = pendingByDependency.get(depUri);
  if (!waiters || !waiters.length) return;
  pendingByDependency.delete(depUri);
  for (const w of waiters) {
    await handleCreateOrUpdate(w.item.collection, w.item.did, w.item.rkey, w.item.value, w.tries);
  }
}

async function handleDelete(collection, did, rkey) {
  const uri = atUri(did, collection, rkey);
  await store.deleteRecordByUri(uri);
  for (const fn of listeners.onDelete) fn(uri);
}

// Run one externally-fetched record through the exact same validate/apply
// path a live Jetstream commit would take. Used when a page needs a
// specific record NOW (a shared /shout/?uri= link, a CAR-imported post)
// instead of waiting for it to scroll past the socket.
export async function ingestOne(collection, did, rkey, value) {
  await handleCreateOrUpdate(collection, did, rkey, value);
  return store.getRecord(atUri(did, collection, rkey));
}

let sweepTimer = null;
function ensureSweep() {
  if (sweepTimer) return;
  sweepTimer = setInterval(async () => {
    for (const [depUri, waiters] of [...pendingByDependency.entries()]) {
      const stillWaiting = [];
      for (const w of waiters) {
        if (w.tries + 1 > ORPHAN_RETRY_LIMIT) {
          const { collection, did, rkey } = w.item;
          await reject(atUri(did, collection, rkey), collection, did, "orphan-parent");
        } else {
          w.tries += 1;
          stillWaiting.push(w);
        }
      }
      if (stillWaiting.length) pendingByDependency.set(depUri, stillWaiting);
      else pendingByDependency.delete(depUri);
    }
  }, 15_000);
}

export function startIngest({ onRecord, onAudit, onDelete, onStatus } = {}) {
  let closed = false;
  let ws = null;
  let reconnectDelay = 1000;
  let hostIdx = 0;
  let cursorUs = null;

  if (onRecord) listeners.onRecord.add(onRecord);
  if (onAudit) listeners.onAudit.add(onAudit);
  if (onDelete) listeners.onDelete.add(onDelete);
  ensureSweep();

  function handleMessage(raw) {
    let evt;
    try {
      evt = JSON.parse(raw);
    } catch {
      return;
    }
    if (evt.kind !== "commit" || !evt.commit) return;
    const c = evt.commit;
    if (!ALL_COLLECTIONS.includes(c.collection)) return;
    if (typeof evt.time_us === "number") cursorUs = evt.time_us;

    if (c.operation === "create" || c.operation === "update") {
      handleCreateOrUpdate(c.collection, evt.did, c.rkey, c.record).catch(() => {});
    } else if (c.operation === "delete") {
      handleDelete(c.collection, evt.did, c.rkey).catch(() => {});
    }
  }

  async function connect() {
    if (closed) return;
    onStatus?.("connecting");
    if (cursorUs == null) {
      cursorUs = await store.getMeta("cursorUs");
      if (cursorUs == null) cursorUs = (Date.now() - BACKFILL_MS) * 1000;
    }
    const host = JETSTREAM_HOSTS[hostIdx % JETSTREAM_HOSTS.length];
    ws = new WebSocket(jetstreamUrl(host, cursorUs));

    ws.onopen = () => {
      reconnectDelay = 1000;
      onStatus?.("live");
    };
    ws.onmessage = (m) => handleMessage(m.data);
    ws.onclose = () => {
      if (closed) return;
      if (cursorUs != null) store.setMeta("cursorUs", cursorUs).catch(() => {});
      onStatus?.("reconnecting");
      hostIdx++;
      setTimeout(connect, reconnectDelay);
      reconnectDelay = Math.min(reconnectDelay * 2, 15000);
    };
    ws.onerror = () => {
      try {
        ws.close();
      } catch {}
    };
  }

  connect();

  return {
    close() {
      closed = true;
      if (onRecord) listeners.onRecord.delete(onRecord);
      if (onAudit) listeners.onAudit.delete(onAudit);
      if (onDelete) listeners.onDelete.delete(onDelete);
      if (cursorUs != null) store.setMeta("cursorUs", cursorUs).catch(() => {});
      try {
        ws?.close();
      } catch {}
    },
  };
}
