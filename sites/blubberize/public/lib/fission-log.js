// fission-log.js — the live, network-wide feed of real net.bisks.blubberize.fission
// records: everyone who has ever hit FISSION while signed in, found via
// listReposByCollection and kept live via Jetstream. No server, no Durable
// Object — a log of records that already live in each fissioner's own PDS
// doesn't need a copy sitting in a database. Copied and trimmed from
// sites/kolpelor/public/lib/global-index.js (same backfill+live pattern).

const COLLECTION = "net.bisks.blubberize.fission";
const JETSTREAM_URL = `wss://jetstream2.us-east.bsky.network/subscribe?wantedCollections=${COLLECTION}`;
const RELAY_URL = "https://bsky.network";
const PLC_DIRECTORY = "https://plc.directory";
const CACHE_KEY = "blubberize:fission-log:v1";

const MAX_ENTRIES = 300;
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

async function resolveHandle(did) {
  try {
    const doc = await didDoc(did);
    const aka = (doc?.alsoKnownAs || []).find((a) => typeof a === "string" && a.startsWith("at://"));
    return aka ? aka.slice("at://".length) : did;
  } catch (_) {
    return did;
  }
}

function normaliseRecord(did, handle, record, uri) {
  if (!record || typeof record !== "object") return null;
  if (typeof record.target !== "string" || typeof record.targetHandle !== "string") return null;
  const ts = Date.parse(record.createdAt || "");
  return {
    did,
    handle,
    uri,
    target: record.target,
    targetHandle: record.targetHandle,
    blubber: Number(record.blubber) || 0,
    yourFollowers: Number(record.yourFollowers) || 0,
    createdAt: Number.isFinite(ts) ? ts : Date.now(),
  };
}

export class FissionLog {
  constructor({ onUpdate } = {}) {
    this.onUpdate = typeof onUpdate === "function" ? onUpdate : () => {};
    this.entries = new Map(); // uri -> normalised entry
    this.handleCache = new Map(); // did -> handle
    this.liveDids = new Set();
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
    const fissions = Array.from(this.entries.values()).sort((a, b) => b.createdAt - a.createdAt).slice(0, MAX_ENTRIES);
    return {
      count: this.entries.size,
      connected: !!this.socket && this.socket.readyState === WebSocket.OPEN,
      backfillDone: this.backfillDone,
      fissions,
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
    if (this.persistTimer) clearTimeout(this.persistTimer);
    if (this.emitTimer) clearTimeout(this.emitTimer);
  }

  restoreCache() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if (!parsed || !Array.isArray(parsed.entries)) return;
      for (const entry of parsed.entries.slice(0, MAX_ENTRIES)) {
        if (!entry || typeof entry.uri !== "string") continue;
        this.entries.set(entry.uri, entry);
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
        // The live log remains available in memory if the cache is too large.
      }
    }, 500);
  }

  emit() {
    try {
      this.onUpdate(this.snapshot());
    } catch (err) {
      console.error("blubberize fission log render failed", err);
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
    const did = event.did;
    this.liveDids.add(did);
    const uri = `at://${did}/${COLLECTION}/${commit.rkey}`;
    if (commit.operation === "delete") {
      if (this.entries.delete(uri)) {
        this.lastUpdated = Date.now();
        this.schedulePersist();
        this.scheduleEmit();
      }
      return;
    }
    if (commit.operation === "create" || commit.operation === "update") {
      this.applyRecord(did, commit.record, uri, true).catch(() => {});
    }
  }

  async applyRecord(did, record, uri, fromLive) {
    if (!fromLive && this.liveDids.has(did) && this.entries.has(uri)) return false;
    let handle = this.handleCache.get(did);
    if (!handle) {
      handle = await resolveHandle(did);
      this.handleCache.set(did, handle);
    }
    const entry = normaliseRecord(did, handle, record, uri);
    if (!entry) return false;
    if (!this.entries.has(uri) && this.entries.size >= MAX_ENTRIES) {
      // Drop the oldest entry to make room — a running log, not an archive.
      let oldestUri = null, oldestTs = Infinity;
      for (const [u, e] of this.entries) {
        if (e.createdAt < oldestTs) { oldestTs = e.createdAt; oldestUri = u; }
      }
      if (oldestUri && oldestTs < entry.createdAt) this.entries.delete(oldestUri);
      else return false;
    }
    this.entries.set(uri, entry);
    this.lastUpdated = Date.now();
    this.schedulePersist();
    this.scheduleEmit();
    return true;
  }

  async runBackfill() {
    if (!this.started || this.paused || this.backfillDone || this.backfillRunning) return;
    this.backfillRunning = true;
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
    } catch (_) {
      retryMs = 5000;
    } finally {
      this.backfillRunning = false;
      this.scheduleEmit();
      if (!this.backfillDone && !this.paused) setTimeout(() => this.runBackfill(), retryMs);
    }
  }

  // One fissioner can hold several fission records — list, not getRecord — so
  // backfill picks up every fission they've ever logged, not just the latest.
  async backfillDid(did) {
    let handle = this.handleCache.get(did);
    if (!handle) {
      handle = await resolveHandle(did);
      this.handleCache.set(did, handle);
    }
    const doc = await didDoc(did);
    const service = (doc?.service || []).find((s) => s.id === "#atproto_pds" || s.type === "AtprotoPersonalDataServer");
    const pdsUrl = typeof service?.serviceEndpoint === "string" ? service.serviceEndpoint : null;
    if (!pdsUrl) return false;
    const base = pdsUrl.replace(/\/$/, "");
    const params = new URLSearchParams({ repo: did, collection: COLLECTION, limit: "100" });
    const data = await xrpcJson(`${base}/xrpc/com.atproto.repo.listRecords?${params}`);
    const records = Array.isArray(data.records) ? data.records : [];
    let applied = false;
    for (const rec of records) {
      const ok = await this.applyRecord(did, rec.value, rec.uri, false);
      applied = applied || ok;
    }
    return applied;
  }
}
