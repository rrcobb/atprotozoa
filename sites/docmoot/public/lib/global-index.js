// global-index.js — a doc's network revision list: every
// net.bisks.docmoot.snapshot record on the network whose docId field matches
// the doc currently open, found via listReposByCollection and kept live via
// Jetstream. No server, no Durable Object — docmoot is deliberately an
// assets-only Worker (see ARCHITECTURE.md); a read-only index of records that
// already live in everyone's own PDS doesn't change that.
//
// Unlike quadrants/catspace's global-index (one record per did, found with a
// single targeted getRecord), a docmoot snapshot's rkey is a PDS-assigned TID,
// not the docId — a did can hold many snapshots across many different docs.
// So backfillDid pages through a did's *entire* snapshot collection via
// listRecords and filters locally for this docId, same shape as
// sites/steamtags/public/lib/global-index.js's multi-record-per-repo backfill.

const COLLECTION = "net.bisks.docmoot.snapshot";
const JETSTREAM_URL = `wss://jetstream2.us-east.bsky.network/subscribe?wantedCollections=${COLLECTION}`;
const RELAY_URL = "https://bsky.network";
const PLC_DIRECTORY = "https://plc.directory";

const MAX_ENTRIES = 500;
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

function normaliseRecord(did, rkey, record, identity) {
  if (!record || typeof record !== "object") return null;
  const title = typeof record.title === "string" && record.title.trim() ? record.title.trim().slice(0, 300) : "Untitled document";
  const text = typeof record.text === "string" ? record.text : "";
  const wordCount = Number.isFinite(record.wordCount) ? record.wordCount : (text.trim() ? text.trim().split(/\s+/).length : 0);
  const createdMs = Date.parse(record.createdAt || "");
  return {
    did,
    rkey,
    handle: identity.handle,
    title,
    text,
    wordCount,
    createdAt: Number.isFinite(createdMs) ? createdMs : Date.now(),
  };
}

export class SnapshotIndex {
  constructor({ docId, onUpdate } = {}) {
    this.docId = docId;
    this.onUpdate = typeof onUpdate === "function" ? onUpdate : () => {};
    this.entries = new Map(); // "did:rkey" -> normalised entry, this.docId only
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

  snapshot() {
    return {
      updatedAt: this.lastUpdated || null,
      count: this.entries.size,
      connected: !!this.socket && this.socket.readyState === WebSocket.OPEN,
      backfillDone: this.backfillDone,
      backfillActive: this.backfillRunning,
      error: this.error,
      revisions: Array.from(this.entries.values()).sort((a, b) => b.createdAt - a.createdAt),
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
      console.error("docmoot global render failed", err);
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
      if (this.entries.delete(`${did}:${commit.rkey}`)) {
        this.lastUpdated = Date.now();
        this.scheduleEmit();
      }
      return;
    }
    if (commit.operation === "create" || commit.operation === "update") {
      // Fire-and-forget: identity resolution is async, but Jetstream
      // messages arrive faster than any one revision needs to appear.
      this.applyRecord(did, commit.rkey, commit.record, true).catch(() => {});
    }
  }

  async applyRecord(did, rkey, record, fromLive) {
    if (!fromLive && this.liveDids.has(`${did}:${rkey}`)) return false;
    if (!record || typeof record !== "object" || record.docId !== this.docId) return false;
    let identity = this.identityCache.get(did);
    if (!identity) {
      identity = await resolveIdentity(did);
      this.identityCache.set(did, identity);
    }
    const entry = normaliseRecord(did, rkey, record, identity);
    if (!entry) return false;
    const key = `${did}:${rkey}`;
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
      console.warn("docmoot global backfill failed", err);
    } finally {
      this.backfillRunning = false;
      this.scheduleEmit();
      if (!this.backfillDone && !this.paused) setTimeout(() => this.runBackfill(), retryMs);
    }
  }

  // A candidate did's snapshot collection can hold revisions of many
  // different docs — page through all of it (bounded) and keep only the
  // records whose docId matches the doc currently open.
  async backfillDid(did) {
    let identity = this.identityCache.get(did);
    if (!identity) {
      identity = await resolveIdentity(did);
      this.identityCache.set(did, identity);
    }
    if (!identity.pdsUrl) return false;
    const base = identity.pdsUrl.replace(/\/$/, "");
    let cursor;
    let changed = false;
    for (let page = 0; page < BACKFILL_RECORD_PAGES_PER_DID; page++) {
      const params = new URLSearchParams({ repo: did, collection: COLLECTION, limit: "100" });
      if (cursor) params.set("cursor", cursor);
      let data;
      try {
        data = await xrpcJson(`${base}/xrpc/com.atproto.repo.listRecords?${params}`);
      } catch (_) {
        break; // an unreachable PDS just yields nothing for this did
      }
      const records = Array.isArray(data.records) ? data.records : [];
      for (const record of records) {
        const rkey = typeof record?.uri === "string" ? record.uri.split("/").pop() : "";
        if (rkey && (await this.applyRecord(did, rkey, record.value, false))) changed = true;
      }
      cursor = typeof data.cursor === "string" ? data.cursor : undefined;
      if (!cursor || !records.length) break;
    }
    return changed;
  }
}
