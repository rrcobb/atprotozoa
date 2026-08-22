// global-index.js — the /directory listing's data source: every
// net.bisks.catspace.profile record on the network, found via
// listReposByCollection and kept live via Jetstream. No server, no
// Durable Object — this repo tried a Registry DO for exactly this once
// (see wrangler.toml's migration history) and ripped it back out, since
// a directory of records that already live in everyone's own PDS doesn't
// need a copy sitting in a database. Copied and trimmed from
// sites/steamtags/public/lib/global-index.js — same backfill+live pattern,
// simplified for a singleton "self" record instead of a multi-record
// collection per repo.

const COLLECTION = "net.bisks.catspace.profile";
const JETSTREAM_URL = `wss://jetstream2.us-east.bsky.network/subscribe?wantedCollections=${COLLECTION}`;
const RELAY_URL = "https://bsky.network";
const PLC_DIRECTORY = "https://plc.directory";
const CACHE_KEY = "catspace:global-index:v1";

const MAX_ENTRIES = 5000;
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

async function resolveIdentity(did) {
  try {
    const doc = await didDoc(did);
    const service = (doc?.service || []).find(
      (item) => item.id === "#atproto_pds" || item.type === "AtprotoPersonalDataServer"
    );
    const pdsUrl = typeof service?.serviceEndpoint === "string" ? service.serviceEndpoint : null;
    const aka = (doc?.alsoKnownAs || []).find((a) => typeof a === "string" && a.startsWith("at://"));
    const handle = aka ? aka.slice("at://".length) : did;
    return { pdsUrl, handle };
  } catch (_) {
    return { pdsUrl: null, handle: did };
  }
}

function blobUrl(pdsUrl, did, blob) {
  const cid = blob?.ref?.$link || blob?.ref?.toString?.();
  if (!cid || !pdsUrl) return null;
  const params = new URLSearchParams({ did, cid });
  return `${pdsUrl.replace(/\/$/, "")}/xrpc/com.atproto.sync.getBlob?${params}`;
}

function normaliseRecord(did, record, identity) {
  if (!record || typeof record !== "object") return null;
  const catName =
    typeof record.catName === "string" && record.catName.trim()
      ? record.catName.trim().slice(0, 40)
      : "Unnamed Cat";
  const mood = typeof record.mood === "string" ? record.mood.slice(0, 40) : "";
  const theme = typeof record.theme === "string" ? record.theme.slice(0, 40) : "bubblegum";
  const updatedMs = Date.parse(record.updatedAt || "");
  return {
    did,
    handle: identity.handle,
    catName,
    mood,
    theme,
    photoUrl: record.photo ? blobUrl(identity.pdsUrl, did, record.photo) : null,
    updatedAt: Number.isFinite(updatedMs) ? updatedMs : Date.now(),
  };
}

export class GlobalIndex {
  constructor({ onUpdate } = {}) {
    this.onUpdate = typeof onUpdate === "function" ? onUpdate : () => {};
    this.entries = new Map(); // did -> normalised entry
    this.identityCache = new Map(); // did -> { pdsUrl, handle }
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
      catCount: this.entries.size,
      connected: !!this.socket && this.socket.readyState === WebSocket.OPEN,
      backfillDone: this.backfillDone,
      backfillActive: this.backfillRunning,
      error: this.error,
      cats: Array.from(this.entries.values()).sort((a, b) => b.updatedAt - a.updatedAt),
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
        if (!entry || typeof entry.did !== "string") continue;
        this.entries.set(entry.did, entry);
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

  emit() {
    try {
      this.onUpdate(this.snapshot());
    } catch (err) {
      console.error("catspace global render failed", err);
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
    const did = event.did;
    this.liveDids.add(did);
    if (commit.operation === "delete") {
      if (this.entries.delete(did)) {
        this.lastUpdated = Date.now();
        this.schedulePersist();
        this.scheduleEmit();
      }
      return;
    }
    if (commit.operation === "create" || commit.operation === "update") {
      // Fire-and-forget: identity resolution is async, but Jetstream
      // messages arrive faster than any one card needs to redraw.
      this.applyRecord(did, commit.record, true).catch(() => {});
    }
  }

  async applyRecord(did, record, fromLive) {
    if (!fromLive && this.liveDids.has(did)) return false;
    if (!record || typeof record !== "object") return false;
    let identity = this.identityCache.get(did);
    if (!identity) {
      identity = await resolveIdentity(did);
      this.identityCache.set(did, identity);
    }
    const entry = normaliseRecord(did, record, identity);
    if (!entry) return false;
    if (!this.entries.has(did) && this.entries.size >= MAX_ENTRIES) return false;
    this.entries.set(did, entry);
    this.lastUpdated = Date.now();
    this.schedulePersist();
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
      this.error = "history scan paused; retrying shortly";
      retryMs = 5000;
      console.warn("catspace global backfill failed", err);
    } finally {
      this.backfillRunning = false;
      this.scheduleEmit();
      if (!this.backfillDone && !this.paused) setTimeout(() => this.runBackfill(), retryMs);
    }
  }

  async backfillDid(did) {
    let identity = this.identityCache.get(did);
    if (!identity) {
      identity = await resolveIdentity(did);
      this.identityCache.set(did, identity);
    }
    if (!identity.pdsUrl) return false;
    const base = identity.pdsUrl.replace(/\/$/, "");
    const params = new URLSearchParams({ repo: did, collection: COLLECTION, rkey: "self" });
    const data = await xrpcJson(`${base}/xrpc/com.atproto.repo.getRecord?${params}`);
    if (!data?.value) return false;
    return this.applyRecord(did, data.value, false);
  }
}
