// global-index.js — network-wide view over a shelfguessr collection:
// com.atproto.sync.listReposByCollection (finds every repo holding the
// collection) + com.atproto.repo.listRecords for backfill, plus a live
// Jetstream subscription for anything written after the page loads.
// Copied verbatim from sites/skymash/public/lib/global-index.js (itself from
// sites/rateyourbuild / sites/steamtags — see notes/ideas/pds-and-lexicons.md,
// "Tier 3: use listReposByCollection"), which already takes the collection
// name and a per-record normalizer so the same class indexes both
// net.bisks.shelfguessr.shelf (the network-wide shelf-photo pool, filtered
// per-round to whichever SimCluster is being played) and
// net.bisks.shelfguessr.guess (the /leaderboard replay source) — this is
// still one site's own internal reuse, not a cross-site shared package.
//
// Per the 2026-08-25/2026-08-28 standing orders (prefer bulk reads over
// paginated cursor walks; don't cap a walk just out of reflexive caution),
// the backfill loop runs until listReposByCollection and every repo's
// listRecords page are genuinely exhausted — BACKFILL_*_PER_STEP only
// throttles how much work happens per tick, it never stops the walk early.
// MAX_ENTRIES is a real memory cap (this all lives in the tab's heap), not a
// network cap.

const JETSTREAM_HOST = "wss://jetstream2.us-east.bsky.network/subscribe";
const RELAY_URL = "https://bsky.network";
const PLC_DIRECTORY = "https://plc.directory";

const MAX_ENTRIES = 60000;
const BACKFILL_DIDS_PER_STEP = 15;
const BACKFILL_REPO_PAGES_PER_STEP = 2;

async function xrpcJson(url) {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res.json();
}

async function didDoc(did) {
  if (did.startsWith("did:plc:")) {
    const res = await fetch(`${PLC_DIRECTORY}/${did}`);
    return res.ok ? res.json() : null;
  }
  if (did.startsWith("did:web:")) {
    const domain = did.slice("did:web:".length).replace(/:/g, "/");
    const res = await fetch(`https://${domain}/.well-known/did.json`);
    return res.ok ? res.json() : null;
  }
  return null;
}

async function resolvePds(did) {
  try {
    const doc = await didDoc(did);
    const service = (doc?.service || []).find(
      (item) => item.id === "#atproto_pds" || item.type === "AtprotoPersonalDataServer",
    );
    return typeof service?.serviceEndpoint === "string" ? service.serviceEndpoint : null;
  } catch (_) {
    return null;
  }
}

export class GlobalIndex {
  // collection: full NSID string, e.g. "net.bisks.skymash.vote"
  // normalize(did, rkey, record): return a plain entry object, or null/undefined to reject
  constructor(collection, { normalize, onUpdate } = {}) {
    this.collection = collection;
    this.normalize = normalize;
    this.onUpdate = typeof onUpdate === "function" ? onUpdate : () => {};
    // v2: the cache used to store the *normalized* entry as `record`, which
    // broke a non-idempotent normalize() (see rawRecords below) — bumped so
    // stale v1 caches (holding an already-normalized shape) are ignored
    // instead of being misread as raw records on the first post-fix load.
    this.cacheKey = `shelfguessr:global-index:${collection}:v2`;
    this.entries = new Map();
    // The raw atproto record for each entry, keyed the same as `entries` —
    // persisted to the cache instead of the normalized entry (see
    // schedulePersist/restoreCache) so a normalize() that isn't idempotent
    // (e.g. converting an ISO votedAt string to a ms number) doesn't get
    // silently double-applied across a page reload and corrupt itself.
    this.rawRecords = new Map();
    this.liveKeys = new Set();
    this.lastUpdated = 0;
    this.socket = null;
    this.reconnectTimer = null;
    this.reconnectDelay = 1000;
    this.persistTimer = null;
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

    this.restoreCache();
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
    return {
      updatedAt: this.lastUpdated || null,
      entryCount: this.entries.size,
      connected: !!this.socket && this.socket.readyState === WebSocket.OPEN,
      backfillDone: this.backfillDone,
      backfillActive: this.backfillRunning,
      error: this.error,
      entries: Array.from(this.entries.values()),
    };
  }

  // Injects a just-written record straight into the index (before Jetstream
  // has necessarily echoed it back), so a writer sees their own record land
  // instantly instead of waiting on the firehose round trip.
  applyOwn(did, rkey, record) {
    const key = `${did}::${rkey}`;
    const entry = this.normalize(did, rkey, record);
    if (!entry) return;
    this.liveKeys.add(key);
    this.entries.set(key, entry);
    this.rawRecords.set(key, record);
    this.lastUpdated = Date.now();
    this.schedulePersist();
    this.emit();
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

  restoreCache() {
    try {
      const raw = localStorage.getItem(this.cacheKey);
      const parsed = raw ? JSON.parse(raw) : null;
      if (!parsed || !Array.isArray(parsed.entries)) return;
      for (const item of parsed.entries.slice(0, MAX_ENTRIES)) {
        if (!item || typeof item.did !== "string" || typeof item.rkey !== "string") continue;
        // item.record is the ORIGINAL atproto record (see schedulePersist) —
        // normalize() must only ever see that shape, never its own output,
        // or a non-idempotent normalize (e.g. one that turns an ISO date
        // string into a ms number) corrupts itself on every reload.
        const normalised = this.normalize(item.did, item.rkey, item.record);
        if (normalised) {
          const key = `${item.did}::${item.rkey}`;
          this.entries.set(key, normalised);
          this.rawRecords.set(key, item.record);
        }
      }
      this.lastUpdated = Number(parsed.savedAt) || 0;
    } catch (_) {
      // A cache miss or a full/blocked localStorage is harmless.
    }
  }

  schedulePersist() {
    if (this.persistTimer) return;
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      try {
        const entries = Array.from(this.rawRecords.entries()).map(([key, record]) => {
          const [did, rkey] = key.split("::");
          return { did, rkey, record };
        });
        localStorage.setItem(this.cacheKey, JSON.stringify({ savedAt: this.lastUpdated, entries }));
      } catch (_) {
        // The live index remains available in memory if the cache is too large.
      }
    }, 500);
  }

  emit() {
    try {
      this.onUpdate(this.snapshot());
    } catch (err) {
      console.error("shelfguessr global-index render failed", err);
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
      socket = new WebSocket(`${JETSTREAM_HOST}?wantedCollections=${this.collection}`);
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
    if (!commit || commit.collection !== this.collection || typeof event.did !== "string") return;
    if (typeof commit.rkey !== "string") return;

    const key = `${event.did}::${commit.rkey}`;
    this.liveKeys.add(key);
    let changed = false;
    if (commit.operation === "delete") {
      this.rawRecords.delete(key);
      changed = this.entries.delete(key);
    } else if (commit.operation === "create" || commit.operation === "update") {
      changed = this.applyRecord(event.did, commit.rkey, commit.record, true);
    }
    if (changed) {
      this.lastUpdated = Date.now();
      this.schedulePersist();
      this.scheduleEmit();
    }
  }

  applyRecord(did, rkey, record, fromLive) {
    const key = `${did}::${rkey}`;
    if (!fromLive && this.liveKeys.has(key)) return false;
    const entry = this.normalize(did, rkey, record);
    if (!entry) {
      this.rawRecords.delete(key);
      return this.entries.delete(key);
    }
    if (!this.entries.has(key) && this.entries.size >= MAX_ENTRIES) return false;
    this.entries.set(key, entry);
    this.rawRecords.set(key, record);
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
          if (await this.backfillDid(did)) this.lastUpdated = Date.now();
        } catch (_) {
          // A broken PDS should not stall other repositories.
        }
      }

      if (!this.backfillQueue.length && !this.backfillReposExhausted) {
        for (let page = 0; page < BACKFILL_REPO_PAGES_PER_STEP; page++) {
          const params = new URLSearchParams({ collection: this.collection, limit: "100" });
          if (this.backfillCursor) params.set("cursor", this.backfillCursor);
          const data = await xrpcJson(`${RELAY_URL}/xrpc/com.atproto.sync.listReposByCollection?${params}`);
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
      this.schedulePersist();
    } catch (err) {
      this.error = "history backfill paused; retrying shortly";
      retryMs = 5000;
      console.warn("shelfguessr global-index backfill failed", err);
    } finally {
      this.backfillRunning = false;
      this.scheduleEmit();
      if (!this.backfillDone && !this.paused) setTimeout(() => this.runBackfill(), retryMs);
    }
  }

  async backfillDid(did) {
    const pds = await resolvePds(did);
    if (!pds) return false;
    const base = pds.replace(/\/$/, "");
    let cursor;
    let changed = false;
    for (;;) {
      const params = new URLSearchParams({ repo: did, collection: this.collection, limit: "100" });
      if (cursor) params.set("cursor", cursor);
      const data = await xrpcJson(`${base}/xrpc/com.atproto.repo.listRecords?${params}`);
      const records = Array.isArray(data.records) ? data.records : [];
      for (const record of records) {
        const rkey = typeof record?.uri === "string" ? record.uri.split("/").pop() : "";
        if (rkey && this.applyRecord(did, rkey, record.value, false)) changed = true;
      }
      cursor = typeof data.cursor === "string" ? data.cursor : undefined;
      if (!cursor || !records.length) break;
    }
    return changed;
  }
}
