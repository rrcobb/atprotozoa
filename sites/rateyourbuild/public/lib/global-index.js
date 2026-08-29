// global-index.js — network-wide view over every net.bisks.rateyourbuild.rating
// record on the protocol: com.atproto.sync.listReposByCollection (finds every
// repo holding the collection) + com.atproto.repo.listRecords for backfill,
// plus a live Jetstream subscription for anything written after the page
// loads. Copied and adapted from sites/steamtags/public/lib/global-index.js,
// the reference implementation for this pattern (see
// notes/ideas/pds-and-lexicons.md, "Tier 3: use listReposByCollection").
//
// Each record is keyed (did, rkey) with rkey === the rated site's bare name,
// one record per (rater, site) — re-rating overwrites in place, so this index
// never double-counts a rater's vote on the same site.
//
// Per the 2026-08-25/2026-08-28 standing orders (prefer bulk reads over
// paginated cursor walks; don't cap a walk just out of reflexive caution),
// the backfill loop below runs until listReposByCollection and every
// repo's listRecords page are genuinely exhausted — BACKFILL_*_PER_STEP only
// throttles how much work happens per tick, it never stops the walk early.
// MAX_ENTRIES is a real memory cap (this all lives in the tab's heap), not a
// network cap.

const COLLECTION = "net.bisks.rateyourbuild.rating";
const JETSTREAM_URL = `wss://jetstream2.us-east.bsky.network/subscribe?wantedCollections=${COLLECTION}`;
const RELAY_URL = "https://bsky.network";
const PLC_DIRECTORY = "https://plc.directory";
const CACHE_KEY = "rateyourbuild:global-index:v1";

const MAX_ENTRIES = 60000;
const BACKFILL_DIDS_PER_STEP = 15;
const BACKFILL_REPO_PAGES_PER_STEP = 2;
const BACKFILL_RECORD_PAGES_PER_DID = 3;

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

function normaliseRecord(did, rkey, record) {
  if (!record || typeof record !== "object") return null;
  const subject = typeof record.subject === "string" ? record.subject.trim() : "";
  if (!subject) return null;
  const score = Number(record.score);
  if (!Number.isInteger(score) || score < 0 || score > 10) return null;
  const text = typeof record.text === "string" ? record.text.trim().slice(0, 3000) : "";
  return {
    did,
    rkey,
    subject,
    score,
    text,
    bugged: record.bugged === true,
    pinged: record.pinged === true,
    ratedAt: typeof record.ratedAt === "string" ? Date.parse(record.ratedAt) || 0 : 0,
  };
}

export class GlobalIndex {
  constructor({ onUpdate, onLiveCommit } = {}) {
    this.onUpdate = typeof onUpdate === "function" ? onUpdate : () => {};
    // Fired for a genuinely live (not backfilled) create/update commit, so a
    // caller can react to "a rating just landed" without waiting on the next
    // debounced snapshot rebuild — used by subscription-index.js to alert on
    // any fresh rating/review without re-deriving it from the whole entries map.
    this.onLiveCommit = typeof onLiveCommit === "function" ? onLiveCommit : () => {};
    this.entries = new Map();
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

  // Synchronous read of whatever's known right now — callers don't wait on
  // backfill, they just get progressively more complete over time.
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
      bySubject: this.buildSubjectStats(),
      entries: Array.from(this.entries.values()),
    };
  }

  // A rater's own rating for one subject, or null. Used so the UI can show
  // "your rating" immediately without waiting on a full snapshot rebuild.
  ownRating(did, subject) {
    return this.entries.get(`${did}::${subject}`) || null;
  }

  // Injects a just-written record straight into the index (before Jetstream
  // has necessarily echoed it back), so the rater sees their own vote land
  // instantly instead of waiting on the firehose round trip.
  applyOwn(did, subject, score, ratedAtIso, text = "", bugged = false, pinged = false) {
    const key = `${did}::${subject}`;
    this.liveKeys.add(key);
    this.entries.set(key, {
      did,
      rkey: subject,
      subject,
      score,
      text: text || "",
      bugged: !!bugged,
      pinged: !!pinged,
      ratedAt: Date.parse(ratedAtIso) || Date.now(),
    });
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
      const raw = localStorage.getItem(CACHE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if (!parsed || !Array.isArray(parsed.entries)) return;
      for (const entry of parsed.entries.slice(0, MAX_ENTRIES)) {
        if (!entry || typeof entry.did !== "string" || typeof entry.rkey !== "string") continue;
        const normalised = normaliseRecord(entry.did, entry.rkey, entry);
        if (normalised) this.entries.set(`${entry.did}::${entry.rkey}`, normalised);
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
        localStorage.setItem(
          CACHE_KEY,
          JSON.stringify({ savedAt: this.lastUpdated, entries: Array.from(this.entries.values()) }),
        );
      } catch (_) {
        // The live index remains available in memory if the cache is too large.
      }
    }, 500);
  }

  emit() {
    try {
      this.onUpdate(this.snapshot());
    } catch (err) {
      console.error("rateyourbuild global render failed", err);
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
    let changed = false;
    if (commit.operation === "delete") {
      changed = this.entries.delete(key);
    } else if (commit.operation === "create" || commit.operation === "update") {
      changed = this.applyRecord(event.did, commit.rkey, commit.record, true);
      if (changed) {
        const entry = this.entries.get(key);
        if (entry) this.onLiveCommit({ did: event.did, subject: entry.subject, score: entry.score, text: entry.text, ratedAt: entry.ratedAt });
      }
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
    if (!record || typeof record !== "object") return false;
    const entry = normaliseRecord(did, rkey, record);
    if (!entry) return this.entries.delete(key);
    if (!this.entries.has(key) && this.entries.size >= MAX_ENTRIES) return false;
    this.entries.set(key, entry);
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
          const params = new URLSearchParams({ collection: COLLECTION, limit: "100" });
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
      console.warn("rateyourbuild global backfill failed", err);
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
    for (let page = 0; page < BACKFILL_RECORD_PAGES_PER_DID; page++) {
      const params = new URLSearchParams({ repo: did, collection: COLLECTION, limit: "100" });
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

  buildSubjectStats() {
    const bySubject = new Map();
    for (const entry of this.entries.values()) {
      let stats = bySubject.get(entry.subject);
      if (!stats) {
        stats = { subject: entry.subject, sum: 0, count: 0, raters: new Set(), latestAt: 0 };
        bySubject.set(entry.subject, stats);
      }
      stats.sum += entry.score;
      stats.count += 1;
      stats.raters.add(entry.did);
      if (entry.ratedAt > stats.latestAt) stats.latestAt = entry.ratedAt;
    }
    return bySubject;
  }
}
