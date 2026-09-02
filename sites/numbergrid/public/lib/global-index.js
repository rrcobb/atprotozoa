// global-index.js — every net.bisks.numbergrid.number record on the whole
// network, found via com.atproto.sync.listReposByCollection (which repos
// hold this collection) + a live Jetstream feed for new writes — not just
// the "type a handle, look at one board" view the rest of this site offers.
// No server, no Durable Object: numbergrid is a pure static Worker (see
// wrangler.toml), this only reads records that already live in everyone's
// own PDS, same recipe as sites/padmoot's public/lib/global-index.js.
//
// Per-candidate backfill prefers one com.atproto.sync.getRepo CAR download
// (fetchRepoRecordsWithKeys, ./car.js) over a paginated listRecords walk —
// the "prefer bulk reads over paginated cursor walks" standing order
// (2026-08-25) applied here for the same reason padmoot/socialcredit/padmoot
// applied it: a board can hold many numbers, and a CAR download gets all of
// them in one request regardless of how many there are. Falls back to a
// capped paginated walk only if the CAR path fails (oversized repo, PDS that
// blocks sync.getRepo, malformed CAR).

import { fetchRepoRecordsWithKeys } from "./car.js";

export const COLLECTION = "net.bisks.numbergrid.number";
const JETSTREAM_URL = `wss://jetstream2.us-east.bsky.network/subscribe?wantedCollections=${COLLECTION}`;
const RELAY_URL = "https://bsky.network";
const PUB_API = "https://public.api.bsky.app/xrpc";
const PLC_DIR = "https://plc.directory";

// Bounds total memory/recompute cost, not a guess about how much data
// exists — every emit regroups every live entry by account to rebuild the
// leaderboard/mex, so this is the ceiling on that work, not a page-count
// habit. 20,000 numbers across every account on the network is already far
// more than this niche a site is likely to ever see.
const MAX_ENTRIES = 20000;
// A number that's ever going to be "spotted by lots of people" is small by
// definition (ages, years, small counts) — nobody's going to independently
// spot the same 14-digit phone number or unix timestamp. Only tracking
// per-value account-sets below this bound keeps the "hot numbers" index
// from growing one entry per arbitrary large one-off value.
const HOT_TRACK_MAX = 1_000_000;
const HOT_LIST_SIZE = 16;
const LEADERBOARD_SIZE = 10;
const BACKFILL_DIDS_PER_STEP = 6;
const BACKFILL_REPO_PAGES_PER_STEP = 2;
const FALLBACK_MAX_PAGES = 20; // matches board.js's fetchBoard cap for a single personal board

async function jget(url) {
  const r = await fetch(url, { headers: { Accept: "application/json" } });
  if (!r.ok) {
    const e = new Error(`HTTP ${r.status}`);
    e.status = r.status;
    throw e;
  }
  return r.json();
}

async function didDoc(did) {
  if (did.startsWith("did:web:")) {
    const host = decodeURIComponent(did.slice("did:web:".length)).replace(/:/g, "/");
    return jget(`https://${host}/.well-known/did.json`);
  }
  return jget(`${PLC_DIR}/${encodeURIComponent(did)}`);
}

const pdsCache = new Map();
async function resolvePds(did) {
  if (pdsCache.has(did)) return pdsCache.get(did);
  let endpoint = null;
  try {
    const doc = await didDoc(did);
    const svc = (doc.service || []).find(
      (s) => s.id === "#atproto_pds" || s.type === "AtprotoPersonalDataServer",
    );
    endpoint = (svc && svc.serviceEndpoint) || null;
  } catch {
    endpoint = null;
  }
  pdsCache.set(did, endpoint);
  return endpoint;
}

const handleCache = new Map();
async function resolveHandleForDid(did) {
  if (handleCache.has(did)) return handleCache.get(did);
  let handle = did;
  try {
    const p = await jget(`${PUB_API}/app.bsky.actor.getProfile?actor=${encodeURIComponent(did)}`);
    if (p.handle) handle = p.handle;
  } catch {}
  handleCache.set(did, handle);
  return handle;
}

function isValidValue(v) {
  return typeof v === "number" && Number.isInteger(v) && v >= 0;
}

async function fetchValuesWithKeys(pds, did) {
  try {
    const { records } = await fetchRepoRecordsWithKeys(pds, did, COLLECTION);
    return records
      .map((r) => ({ rkey: r.uri.split("/").pop(), value: r.value && r.value.value }))
      .filter((r) => isValidValue(r.value));
  } catch {
    return fetchValuesViaWalk(pds, did);
  }
}

async function fetchValuesViaWalk(pds, did) {
  const base = pds.replace(/\/$/, "");
  const out = [];
  let cursor;
  for (let page = 0; page < FALLBACK_MAX_PAGES; page++) {
    const params = new URLSearchParams({ repo: did, collection: COLLECTION, limit: "100" });
    if (cursor) params.set("cursor", cursor);
    let data;
    try {
      data = await jget(`${base}/xrpc/com.atproto.repo.listRecords?${params}`);
    } catch {
      break;
    }
    const records = Array.isArray(data.records) ? data.records : [];
    for (const rec of records) {
      const value = rec?.value?.value;
      const rkey = typeof rec?.uri === "string" ? rec.uri.split("/").pop() : "";
      if (rkey && isValidValue(value)) out.push({ rkey, value });
    }
    cursor = typeof data.cursor === "string" ? data.cursor : undefined;
    if (!cursor || !records.length) break;
  }
  return out;
}

// mex (minimum excludant) of a sorted, deduped, ascending array — same
// definition as board.js's mex(), reimplemented here rather than imported so
// this module has no dependency on the page it's mounted from.
function mex(sortedValues) {
  let m = 0;
  for (const v of sortedValues) {
    if (v === m) m++;
    else if (v > m) break;
  }
  return m;
}

export class GlobalIndex {
  constructor({ onUpdate } = {}) {
    this.onUpdate = typeof onUpdate === "function" ? onUpdate : () => {};
    this.entries = new Map(); // "did::rkey" -> { did, handle, value }
    this.liveKeys = new Set();
    this.lastUpdated = 0;
    this.socket = null;
    this.reconnectTimer = null;
    this.reconnectDelay = 1000;
    this.emitTimer = null;
    this.started = false;
    this.paused = false;
    this.backfillRunning = false;
    this.backfillDone = false;
    this.backfillReposExhausted = false;
    this.backfillCursor = undefined;
    this.backfillQueue = [];
    this.backfillQueued = new Set();
    this.error = "";
    this.visibilityHandler = () => {
      if (document.visibilityState === "hidden") this.pause();
      else this.resume();
    };
    document.addEventListener("visibilitychange", this.visibilityHandler);
  }

  start() {
    if (this.started) return;
    this.started = true;
    this.paused = document.visibilityState === "hidden";
    this.emit();
    if (!this.paused) {
      this.connect();
      this.runBackfill();
    }
  }

  snapshot() {
    // Regroup every entry by account on each emit — simplest way to keep the
    // leaderboard/hot-numbers/mex consistent with whatever live or delete
    // events have landed, and MAX_ENTRIES keeps this cheap.
    const byDid = new Map(); // did -> { handle, values: Set }
    const hotCounts = new Map(); // value -> Set(did)
    for (const { did, handle, value } of this.entries.values()) {
      let acc = byDid.get(did);
      if (!acc) {
        acc = { handle, values: new Set() };
        byDid.set(did, acc);
      }
      acc.values.add(value);
      if (value < HOT_TRACK_MAX) {
        let who = hotCounts.get(value);
        if (!who) {
          who = new Set();
          hotCounts.set(value, who);
        }
        who.add(did);
      }
    }

    const union = new Set();
    const leaderboard = [];
    for (const [did, acc] of byDid) {
      let max = -1;
      for (const v of acc.values) {
        union.add(v);
        if (v > max) max = v;
      }
      leaderboard.push({ did, handle: acc.handle, count: acc.values.size, max });
    }
    const sortedUnion = [...union].sort((a, b) => a - b);
    const networkMex = mex(sortedUnion);

    const byCount = [...leaderboard].sort((a, b) => b.count - a.count).slice(0, LEADERBOARD_SIZE);
    const byMax = [...leaderboard].sort((a, b) => b.max - a.max).slice(0, LEADERBOARD_SIZE);

    const hotNumbers = [...hotCounts.entries()]
      .map(([value, who]) => ({ value, accounts: who.size }))
      .filter((h) => h.accounts > 1) // "hot" implies more than one person independently spotted it
      .sort((a, b) => b.accounts - a.accounts || a.value - b.value)
      .slice(0, HOT_LIST_SIZE);

    return {
      updatedAt: this.lastUpdated || null,
      entryCount: this.entries.size,
      accountCount: byDid.size,
      valueCount: union.size,
      networkMex,
      networkMexDigits: String(networkMex).length,
      byCount,
      byMax,
      hotNumbers,
      connected: !!this.socket && this.socket.readyState === WebSocket.OPEN,
      backfillDone: this.backfillDone,
      backfillActive: this.backfillRunning,
      error: this.error,
    };
  }

  pause() {
    this.paused = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    if (this.socket) {
      try {
        this.socket.close();
      } catch {}
    }
    this.socket = null;
    this.emit();
  }

  resume() {
    this.paused = false;
    if (!this.started) return;
    this.connect();
    this.runBackfill();
    this.emit();
  }

  dispose() {
    this.pause();
    document.removeEventListener("visibilitychange", this.visibilityHandler);
    if (this.emitTimer) clearTimeout(this.emitTimer);
  }

  emit() {
    try {
      this.onUpdate(this.snapshot());
    } catch (err) {
      console.error("numbergrid global render failed", err);
    }
  }

  scheduleEmit() {
    if (this.emitTimer) return;
    this.emitTimer = setTimeout(() => {
      this.emitTimer = null;
      this.emit();
    }, 100);
  }

  connect() {
    if (!this.started || this.paused || this.socket) return;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    let socket;
    try {
      socket = new WebSocket(JETSTREAM_URL);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.socket = socket;
    socket.addEventListener("open", () => {
      if (this.socket !== socket) return;
      this.reconnectDelay = 1000;
      this.error = "";
      this.emit();
    });
    socket.addEventListener("message", (event) => this.handleMessage(String(event.data)));
    socket.addEventListener("error", () => {
      try {
        socket.close();
      } catch {}
    });
    socket.addEventListener("close", () => {
      if (this.socket === socket) this.socket = null;
      if (!this.paused) this.scheduleReconnect();
      this.emit();
    });
  }

  scheduleReconnect() {
    if (!this.started || this.paused || this.reconnectTimer) return;
    const delay = this.reconnectDelay;
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30000);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  handleMessage(raw) {
    let event;
    try {
      event = JSON.parse(raw);
    } catch {
      return;
    }
    if (event.kind !== "commit") return;
    const commit = event.commit;
    if (!commit || commit.collection !== COLLECTION || typeof event.did !== "string") return;
    if (typeof commit.rkey !== "string") return;
    const key = `${event.did}::${commit.rkey}`;
    this.liveKeys.add(key);
    if (commit.operation === "delete") {
      if (this.entries.delete(key)) {
        this.lastUpdated = Date.now();
        this.scheduleEmit();
      }
      return;
    }
    if (commit.operation === "create" || commit.operation === "update") {
      this.applyLiveRecord(event.did, commit.rkey, commit.record).catch(() => {});
    }
  }

  async applyLiveRecord(did, rkey, record) {
    const value = record && record.value;
    if (!isValidValue(value)) return;
    const key = `${did}::${rkey}`;
    if (!this.entries.has(key) && this.entries.size >= MAX_ENTRIES) return;
    const handle = await resolveHandleForDid(did);
    this.entries.set(key, { did, handle, value });
    this.lastUpdated = Date.now();
    this.scheduleEmit();
  }

  async runBackfill() {
    if (!this.started || this.paused || this.backfillDone || this.backfillRunning) return;
    this.backfillRunning = true;
    this.error = "";
    let retryMs = 250;
    try {
      let processed = 0;
      while (this.backfillQueue.length && processed < BACKFILL_DIDS_PER_STEP) {
        const did = this.backfillQueue.shift();
        processed++;
        try {
          await this.backfillDid(did);
        } catch {}
      }

      if (!this.backfillQueue.length && !this.backfillReposExhausted) {
        for (let page = 0; page < BACKFILL_REPO_PAGES_PER_STEP; page++) {
          const params = new URLSearchParams({ collection: COLLECTION, limit: "100" });
          if (this.backfillCursor) params.set("cursor", this.backfillCursor);
          const data = await jget(`${RELAY_URL}/xrpc/com.atproto.sync.listReposByCollection?${params}`);
          const repos = Array.isArray(data.repos) ? data.repos : [];
          for (const repo of repos) {
            const did = repo?.did;
            if (typeof did === "string" && !this.backfillQueued.has(did)) {
              this.backfillQueued.add(did);
              this.backfillQueue.push(did);
            }
          }
          this.backfillCursor = typeof data.cursor === "string" ? data.cursor : undefined;
          if (!this.backfillCursor || !repos.length) {
            this.backfillReposExhausted = true;
            break;
          }
        }
      }

      if (this.backfillReposExhausted && !this.backfillQueue.length) this.backfillDone = true;
    } catch (err) {
      this.error = "network scan paused; retrying shortly";
      retryMs = 5000;
      console.warn("numbergrid global backfill failed", err);
    } finally {
      this.backfillRunning = false;
      this.scheduleEmit();
      if (!this.backfillDone && !this.paused) setTimeout(() => this.runBackfill(), retryMs);
    }
  }

  async backfillDid(did) {
    const handle = await resolveHandleForDid(did);
    const pds = await resolvePds(did);
    if (!pds) return false;
    const rows = await fetchValuesWithKeys(pds, did);
    let changed = false;
    for (const { rkey, value } of rows) {
      const key = `${did}::${rkey}`;
      if (this.liveKeys.has(key)) continue; // a live event already landed a fresher copy of this key
      if (!this.entries.has(key) && this.entries.size >= MAX_ENTRIES) continue;
      this.entries.set(key, { did, handle, value });
      changed = true;
    }
    return changed;
  }
}
