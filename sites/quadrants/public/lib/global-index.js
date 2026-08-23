// global-index.js — a chart's live position index: every
// net.bisks.quadrants.position record on the network whose rkey matches this
// chart's id, found via listReposByCollection and kept live via Jetstream. No
// server, no Durable Object — wrangler.toml's own migration history documents
// building a QuadrantHub DO for exactly this and ripping it back out, since a
// directory of records that already live in everyone's own PDS doesn't need a
// copy sitting in a database. Copied and trimmed from
// sites/catspace/public/lib/global-index.js, but scoped to one rkey (the
// chart id) instead of a singleton "self" record — this collection holds one
// record per (person, chart), and the rkey IS the chart id, so a targeted
// getRecord per candidate did is enough; no need to list every record a did
// has ever written across every chart it's touched.

const COLLECTION = "net.bisks.quadrants.position";
const JETSTREAM_URL = `wss://jetstream2.us-east.bsky.network/subscribe?wantedCollections=${COLLECTION}`;
const RELAY_URL = "https://bsky.network";
const PLC_DIRECTORY = "https://plc.directory";

const MAX_ENTRIES = 2000;
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

function normaliseRecord(did, record, identity) {
  if (!record || typeof record !== "object") return null;
  const x = Number(record.x);
  const y = Number(record.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return {
    did,
    handle: identity.handle,
    x: Math.max(-1, Math.min(1, x / 1000)),
    y: Math.max(-1, Math.min(1, y / 1000)),
    updatedAt: Date.parse(record.createdAt || "") || Date.now(),
  };
}

export class GlobalIndex {
  constructor({ chartId, onUpdate } = {}) {
    this.chartId = chartId;
    this.onUpdate = typeof onUpdate === "function" ? onUpdate : () => {};
    this.entries = new Map(); // did -> normalised entry, this.chartId only
    this.identityCache = new Map(); // did -> { pdsUrl, handle }
    this.liveDids = new Set();
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

  // Jump one specific did to the front, bypassing the scan order — used to
  // surface the signed-in viewer's own past marker on this chart right away,
  // instead of waiting for listReposByCollection's pagination to reach it.
  async primeDid(did) {
    if (!did || this.backfillQueued.has(did)) return;
    this.backfillQueued.add(did);
    try {
      if (await this.backfillDid(did)) this.lastUpdated = Date.now();
      this.scheduleEmit();
    } catch (_) {
      // A failed priority fetch just falls back to the normal backfill scan.
    }
  }

  // Lets a caller that already knows a did's PDS + handle (e.g. from its own
  // OAuth session) skip this index's own DID-doc resolution round trip.
  seedIdentity(did, identity) {
    if (did && identity) this.identityCache.set(did, identity);
  }

  // Injects a record the viewer just wrote themselves, so their own marker
  // updates instantly instead of waiting on a Jetstream round trip.
  applyLocal(did, record) {
    this.liveDids.add(did);
    this.applyRecord(did, record, true).catch(() => {});
  }

  removeLocal(did) {
    this.liveDids.add(did);
    if (this.entries.delete(did)) {
      this.lastUpdated = Date.now();
      this.scheduleEmit();
    }
  }

  snapshot() {
    return {
      updatedAt: this.lastUpdated || null,
      count: this.entries.size,
      connected: !!this.socket && this.socket.readyState === WebSocket.OPEN,
      backfillDone: this.backfillDone,
      backfillActive: this.backfillRunning,
      error: this.error,
      positions: Array.from(this.entries.values()),
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
      console.error("quadrants global render failed", err);
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
    if (commit.rkey !== this.chartId) return; // some other chart — not ours
    const did = event.did;
    this.liveDids.add(did);
    if (commit.operation === "delete") {
      if (this.entries.delete(did)) {
        this.lastUpdated = Date.now();
        this.scheduleEmit();
      }
      return;
    }
    if (commit.operation === "create" || commit.operation === "update") {
      // Fire-and-forget: identity resolution is async, but Jetstream
      // messages arrive faster than any one marker needs to redraw.
      this.applyRecord(did, commit.record, true).catch(() => {});
    }
  }

  async applyRecord(did, record, fromLive) {
    if (!fromLive && this.liveDids.has(did)) return false;
    if (!record || typeof record !== "object" || record.chart !== this.chartId) return false;
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
    } catch (err) {
      this.error = "network scan paused; retrying shortly";
      retryMs = 5000;
      console.warn("quadrants global backfill failed", err);
    } finally {
      this.backfillRunning = false;
      this.scheduleEmit();
      if (!this.backfillDone && !this.paused) setTimeout(() => this.runBackfill(), retryMs);
    }
  }

  // A candidate did may hold positions on many charts, but its rkey for this
  // one — if it exists — is exactly this.chartId, so a single targeted
  // getRecord is enough; no need to page through everything the did has ever
  // plotted just to find the one record that matters here.
  async backfillDid(did) {
    let identity = this.identityCache.get(did);
    if (!identity) {
      identity = await resolveIdentity(did);
      this.identityCache.set(did, identity);
    }
    if (!identity.pdsUrl) return false;
    const base = identity.pdsUrl.replace(/\/$/, "");
    const params = new URLSearchParams({ repo: did, collection: COLLECTION, rkey: this.chartId });
    let data;
    try {
      data = await xrpcJson(`${base}/xrpc/com.atproto.repo.getRecord?${params}`);
    } catch (_) {
      return false; // no record for this chart on that repo — the common case
    }
    if (!data?.value) return false;
    return this.applyRecord(did, data.value, false);
  }
}
