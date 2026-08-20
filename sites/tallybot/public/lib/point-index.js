// point-index.js — network-wide view over every net.bisks.tallybot.point
// record on the protocol, via com.atproto.sync.listReposByCollection (finds
// every repo holding the collection) + com.atproto.repo.listRecords for
// backfill, plus a live Jetstream subscription for anything written after
// the page loads. Copied and adapted from
// sites/steamtags/public/lib/global-index.js (the reference implementation
// for this pattern — see notes/ideas/pds-and-lexicons.md, "Tier 3: use
// listReposByCollection").
//
// Why this exists: signed-in votes on tallybot write a
// net.bisks.tallybot.point record straight to the voter's own PDS (see
// index.html's castVote()), but until this file existed nothing ever read
// those records back — public-tally.js only scraped app.bsky.feed.searchPosts
// for literal "<name> +1"/"-1" post text, so a PDS-record vote never showed
// up on the leaderboard and confirmVote()'s poll of /api/activity was
// guaranteed to time out on every single signed-in vote. This index makes
// those records visible: public-tally.js merges its snapshot in.

const COLLECTION = "net.bisks.tallybot.point";
const RELAY_URL = "https://bsky.network";
const PLC_DIRECTORY = "https://plc.directory";
const CACHE_KEY = "tallybot:point-index:v1";

const MAX_ENTRIES = 40000;
const MAX_VOTES_KEPT = 500;
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
      (item) => item.id === "#atproto_pds" || item.type === "AtprotoPersonalDataServer"
    );
    return typeof service?.serviceEndpoint === "string" ? service.serviceEndpoint : null;
  } catch (_) {
    return null;
  }
}

// Same normalization public-tally.js applies to the display name parsed out
// of "<name> +1" post text, so a name voted on via both paths merges into one
// tally instead of splitting into two.
function normaliseRecord(did, rkey, record) {
  if (!record || typeof record !== "object") return null;
  if (typeof record.name !== "string") return null;
  const displayName = record.name.trim().replace(/\s+/g, " ");
  if (!displayName) return null;
  const delta = record.delta;
  if (delta !== 1 && delta !== -1) return null;
  return {
    did,
    rkey,
    key: displayName.toLowerCase(),
    displayName,
    delta,
    createdAt: typeof record.createdAt === "string" ? Date.parse(record.createdAt) || 0 : 0,
  };
}

export class PointIndex {
  constructor() {
    this.entries = new Map();
    this.liveKeys = new Set();
    this.lastUpdated = 0;
    this.socket = null;
    this.reconnectTimer = null;
    this.reconnectDelay = 1000;
    this.persistTimer = null;
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
    if (!this.paused) {
      this.connect();
      this.runBackfill();
    }
  }

  // Synchronous read of whatever's known right now — callers don't wait on
  // backfill, they just get progressively more complete over time.
  snapshot() {
    return {
      updatedAt: this.lastUpdated || null,
      entryCount: this.entries.size,
      connected: !!this.socket && this.socket.readyState === WebSocket.OPEN,
      backfillDone: this.backfillDone,
      backfillActive: this.backfillRunning,
      error: this.error,
      ...this.buildSnapshot(),
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
  }

  resume() {
    this.paused = false;
    if (!this.started) return;
    this.connect();
    this.runBackfill();
  }

  restoreCache() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if (!parsed || !Array.isArray(parsed.entries)) return;
      for (const entry of parsed.entries.slice(0, MAX_ENTRIES)) {
        if (!entry || typeof entry.did !== "string" || typeof entry.rkey !== "string") continue;
        this.entries.set(`${entry.did}::${entry.rkey}`, entry);
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
          JSON.stringify({ savedAt: this.lastUpdated, entries: Array.from(this.entries.values()) })
        );
      } catch (_) {
        // The live index remains available in memory if the cache is too large.
      }
    }, 500);
  }

  connect() {
    if (!this.started || this.paused || this.socket) return;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    let socket;
    try {
      socket = new WebSocket(`wss://jetstream2.us-east.bsky.network/subscribe?wantedCollections=${COLLECTION}`);
    } catch (_) {
      this.scheduleReconnect();
      return;
    }
    this.socket = socket;
    socket.addEventListener("open", () => {
      if (this.socket !== socket) return;
      this.reconnectDelay = 1000;
      this.error = "";
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
    }
    if (changed) {
      this.lastUpdated = Date.now();
      this.schedulePersist();
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
      console.warn("tallybot point-index backfill failed", err);
    } finally {
      this.backfillRunning = false;
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

  buildSnapshot() {
    const tallies = new Map();
    const votes = [];
    for (const entry of this.entries.values()) {
      let t = tallies.get(entry.key);
      if (!t) {
        t = { key: entry.key, displayName: entry.displayName, score: 0, upCount: 0, downCount: 0, updatedAt: 0 };
        tallies.set(entry.key, t);
      }
      t.score += entry.delta;
      t[entry.delta > 0 ? "upCount" : "downCount"]++;
      if (entry.createdAt >= t.updatedAt) {
        t.updatedAt = entry.createdAt;
        t.displayName = entry.displayName;
      }
      votes.push({
        key: entry.key,
        displayName: entry.displayName,
        delta: entry.delta,
        voterDid: entry.did,
        createdAt: entry.createdAt,
      });
    }
    votes.sort((a, b) => b.createdAt - a.createdAt);
    return { tallies, votes: votes.slice(0, MAX_VOTES_KEPT) };
  }
}
