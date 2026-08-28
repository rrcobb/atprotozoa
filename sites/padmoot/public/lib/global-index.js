// global-index.js — every net.bisks.padmoot.pattern on the whole network,
// found via com.atproto.sync.listReposByCollection + a live Jetstream feed —
// not just the "type a handle, scan their follows" lookup the main page's
// browse panel does. No server, no Durable Object: padmoot is a pure static
// Worker (see wrangler.toml), and this only reads records that already live
// in everyone's own PDS.
//
// Same multi-record-per-repo shape as steamtags'/docmoot's global-index (the
// pattern lexicon's key is "tid" — one did can hold many patterns), so
// backfillDid pages a candidate's whole pattern collection, not a single
// getRecord. Unlike those two, it reuses this site's own lib/atproto.js
// listRecords() for that instead of a hand-rolled paginated fetch: it already
// tries one com.atproto.sync.getRepo CAR download before falling back to a
// paginated listRecords walk, which is exactly the "prefer bulk reads over
// paginated cursor walks" standing order (2026-08-25) applied to the same
// per-repo backfill problem steamtags/docmoot solved before that order
// existed.

import { resolvePds, resolveHandleForDid, listRecords } from "./atproto.js";

const COLLECTION = "net.bisks.padmoot.pattern";
const JETSTREAM_URL = `wss://jetstream2.us-east.bsky.network/subscribe?wantedCollections=${COLLECTION}`;
const RELAY_URL = "https://bsky.network";

const MAX_ENTRIES = 3000;
const BACKFILL_DIDS_PER_STEP = 10;
const BACKFILL_REPO_PAGES_PER_STEP = 2;

async function xrpcJson(url) {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res.json();
}

function normaliseRecord(did, rkey, record, handle) {
  if (!record || typeof record !== "object") return null;
  const title =
    typeof record.title === "string" && record.title.trim()
      ? record.title.trim().slice(0, 120)
      : "untitled beat";
  const layout = ["mpc", "launchpad", "tr909"].includes(record.layout) ? record.layout : "mpc";
  const bpm = Number.isFinite(record.bpm) ? record.bpm : 120;
  const trackCount = Array.isArray(record.tracks) ? record.tracks.length : 0;
  const createdMs = Date.parse(record.createdAt || "");
  return {
    did,
    rkey,
    handle: handle || did,
    title,
    layout,
    bpm,
    trackCount,
    isRemix: typeof record.remixOf === "string" && !!record.remixOf,
    createdAt: Number.isFinite(createdMs) ? createdMs : 0,
  };
}

export class GlobalIndex {
  constructor({ onUpdate } = {}) {
    this.onUpdate = typeof onUpdate === "function" ? onUpdate : () => {};
    this.entries = new Map(); // "did::rkey" -> normalised entry
    this.handleCache = new Map(); // did -> handle
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
    const userCount = new Set(Array.from(this.entries.values()).map((e) => e.did)).size;
    return {
      updatedAt: this.lastUpdated || null,
      entryCount: this.entries.size,
      userCount,
      connected: !!this.socket && this.socket.readyState === WebSocket.OPEN,
      backfillDone: this.backfillDone,
      backfillActive: this.backfillRunning,
      error: this.error,
      patterns: Array.from(this.entries.values()).sort((a, b) => b.createdAt - a.createdAt),
    };
  }

  pause() {
    this.paused = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    if (this.socket) {
      try {
        this.socket.close();
      } catch (_) {
        // The browser may already have closed the socket.
      }
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
      console.error("padmoot global render failed", err);
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
    } catch (_) {
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
      } catch (_) {
        // The close event will handle reconnecting.
      }
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
    } catch (_) {
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
      // Fire-and-forget: handle resolution is async, but Jetstream messages
      // arrive well before any one entry needs to be on screen.
      this.applyLiveRecord(event.did, commit.rkey, commit.record).catch(() => {});
    }
  }

  async applyLiveRecord(did, rkey, record) {
    let handle = this.handleCache.get(did);
    if (!handle) {
      handle = await resolveHandleForDid(did);
      this.handleCache.set(did, handle);
    }
    const entry = normaliseRecord(did, rkey, record, handle);
    if (!entry) return false;
    const key = `${did}::${rkey}`;
    if (!this.entries.has(key) && this.entries.size >= MAX_ENTRIES) return false;
    this.entries.set(key, entry);
    this.lastUpdated = Date.now();
    this.scheduleEmit();
    return true;
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
        } catch (_) {
          // A broken PDS should not stall the rest of the queue.
        }
      }

      if (!this.backfillQueue.length && !this.backfillReposExhausted) {
        for (let page = 0; page < BACKFILL_REPO_PAGES_PER_STEP; page++) {
          const params = new URLSearchParams({ collection: COLLECTION, limit: "100" });
          if (this.backfillCursor) params.set("cursor", this.backfillCursor);
          const data = await xrpcJson(
            `${RELAY_URL}/xrpc/com.atproto.sync.listReposByCollection?${params}`,
          );
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
      console.warn("padmoot global backfill failed", err);
    } finally {
      this.backfillRunning = false;
      this.scheduleEmit();
      if (!this.backfillDone && !this.paused) setTimeout(() => this.runBackfill(), retryMs);
    }
  }

  // A candidate did's pattern collection can hold many patterns — page
  // through all of it (via lib/atproto.js's CAR-first listRecords) rather
  // than fetching just one.
  async backfillDid(did) {
    let handle = this.handleCache.get(did);
    if (!handle) {
      handle = await resolveHandleForDid(did);
      this.handleCache.set(did, handle);
    }
    const pds = await resolvePds(did);
    if (!pds) return false;
    let records;
    try {
      records = await listRecords(pds, did, COLLECTION, null, 3);
    } catch (_) {
      return false;
    }
    let changed = false;
    for (const rec of records) {
      const rkey = typeof rec?.uri === "string" ? rec.uri.split("/").pop() : "";
      if (!rkey) continue;
      const key = `${did}::${rkey}`;
      if (this.liveKeys.has(key)) continue;
      const entry = normaliseRecord(did, rkey, rec.value, handle);
      if (!entry) continue;
      if (!this.entries.has(key) && this.entries.size >= MAX_ENTRIES) continue;
      this.entries.set(key, entry);
      changed = true;
    }
    return changed;
  }
}
