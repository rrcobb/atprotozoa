// global-wall.js — the real public apology wall, network-wide.
//
// net.bisks.recant.apology (see ../../lexicons) is written by the browser
// straight to the author's own PDS. This file rebuilds the public wall
// entirely client-side, same recipe as sites/duohaunt's own global-wall.js:
//
//   1. com.atproto.sync.listReposByCollection finds every repo that has ever
//      written an apology — a paginated walk over *repos*, which has no bulk
//      alternative (2026-08-25 standing order in
//      sites/buildthis/builder/INSTRUCTIONS.md).
//   2. For each repo, one com.atproto.sync.getRepo CAR download
//      (./car.js) pulls that repo's *entire* apology history in one
//      request instead of paginating com.atproto.repo.listRecords —
//      "prefer bulk reads," same order.
//   3. Every apology is kept (not folded into a single per-author state —
//      recanting more than once is fine, the wall is a feed of all of them),
//      deduped by at-uri, newest first.
//
// handle/displayName/avatar come from a separate batched
// app.bsky.actor.getProfiles lookup, same as sites/socialcredit's sc-client.js.
//
// A live wss://jetstream subscription layers new apologies on top while the
// wall is open, no reload needed.

import { fetchRepoRecordsWithKeys } from "./car.js";

const COLLECTION = "net.bisks.recant.apology";
const JETSTREAM_URL = `wss://jetstream2.us-east.bsky.network/subscribe?wantedCollections=${COLLECTION}`;
const RELAY_URL = "https://bsky.network";
const PLC_DIRECTORY = "https://plc.directory";
const PUB = "https://api.bsky.app/xrpc";
const CACHE_KEY = "recant:wall-cache:v1";

const MAX_ENTRIES = 5000; // backstop against unbounded browser memory, not a visible-content cap
const REPO_PAGES_PER_STEP = 2;
const DIDS_PER_STEP = 3; // CAR downloads are heavier than a listRecords page; keep steps small so the tab stays responsive
const PROFILE_BATCH = 25; // app.bsky.actor.getProfiles' own cap
const MAX_TEXT_GRAPHEMES = 300;

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

function fromApologyRecord(r) {
  if (!r || typeof r !== "object") return null;
  const text = typeof r.text === "string" ? r.text.slice(0, MAX_TEXT_GRAPHEMES * 4) : "";
  if (!text.trim()) return null;
  const subject = typeof r.subject === "string" ? r.subject.slice(0, 400) : "";
  const createdAtMs = Date.parse(r.createdAt);
  return {
    text: text.trim(),
    subject: subject.trim(),
    createdAtMs: Number.isFinite(createdAtMs) ? createdAtMs : Date.now(),
  };
}

export class GlobalWall {
  constructor({ onUpdate } = {}) {
    this.onUpdate = typeof onUpdate === "function" ? onUpdate : () => {};
    this.entries = new Map(); // at-uri -> { did, text, subject, createdAtMs }
    this.profiles = new Map(); // did -> { handle, displayName, avatar }
    this.pendingProfiles = new Set();
    this.queue = [];
    this.queued = new Set();
    this.cursor = undefined;
    this.reposExhausted = false;
    this.backfillRunning = false;
    this.backfillDone = false;
    this.reposSeen = 0;
    this.reposScanned = 0;
    this.error = "";
    this.socket = null;
    this.reconnectTimer = null;
    this.reconnectDelay = 1000;
    this.started = false;
    this._persistTimer = null;
    this._emitTimer = null;

    this.restoreCache();
  }

  start() {
    if (this.started) return;
    this.started = true;
    this.emit();
    this.connect();
    this.runBackfill();
  }

  dispose() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.socket) {
      try { this.socket.close(); } catch (_) {}
    }
    this.socket = null;
  }

  restoreCache() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if (!parsed || !Array.isArray(parsed.entries)) return;
      for (const e of parsed.entries.slice(0, MAX_ENTRIES)) {
        if (!e || typeof e.uri !== "string" || typeof e.did !== "string") continue;
        const { uri, ...rest } = e;
        this.entries.set(uri, rest);
      }
    } catch (_) {
      // A cache miss or a full/blocked localStorage is harmless — backfill fills it back in.
    }
  }

  schedulePersist() {
    if (this._persistTimer) return;
    this._persistTimer = setTimeout(() => {
      this._persistTimer = null;
      try {
        const entries = Array.from(this.entries.entries())
          .slice(0, MAX_ENTRIES)
          .map(([uri, e]) => ({ uri, ...e }));
        localStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt: Date.now(), entries }));
      } catch (_) {
        // The live wall stays available in memory if the cache write fails.
      }
    }, 500);
  }

  emit() {
    try {
      this.onUpdate(this.snapshot());
    } catch (err) {
      console.error("recant global wall render failed", err);
    }
  }

  scheduleEmit() {
    if (this._emitTimer) return;
    this._emitTimer = setTimeout(() => {
      this._emitTimer = null;
      this.emit();
    }, 100);
  }

  snapshot() {
    const entries = Array.from(this.entries.entries()).map(([uri, e]) => {
      const profile = this.profiles.get(e.did);
      return {
        uri,
        did: e.did,
        handle: profile?.handle || e.did,
        displayName: profile?.displayName || profile?.handle || e.did,
        avatar: profile?.avatar || "",
        text: e.text,
        subject: e.subject,
        createdAtMs: e.createdAtMs,
      };
    });
    entries.sort((a, b) => b.createdAtMs - a.createdAtMs);
    return {
      entries,
      total: entries.length,
      backfillDone: this.backfillDone,
      backfillActive: this.backfillRunning,
      reposScanned: this.reposScanned,
      reposSeen: Math.max(this.reposSeen, this.reposScanned),
      connected: !!this.socket && this.socket.readyState === WebSocket.OPEN,
      error: this.error,
    };
  }

  // --- live -------------------------------------------------------------

  connect() {
    if (!this.started || this.socket) return;
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
      try { socket.close(); } catch (_) {}
    });
    socket.addEventListener("close", () => {
      if (this.socket === socket) this.socket = null;
      this.scheduleReconnect();
      this.emit();
    });
  }

  scheduleReconnect() {
    if (!this.started || this.reconnectTimer) return;
    const delay = this.reconnectDelay;
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30000);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  handleMessage(raw) {
    let event;
    try { event = JSON.parse(raw); } catch (_) { return; }
    if (event.kind !== "commit") return;
    const commit = event.commit;
    if (!commit || commit.collection !== COLLECTION || typeof event.did !== "string") return;
    if (commit.operation !== "create" && commit.operation !== "update") return;
    const parsed = fromApologyRecord(commit.record);
    if (!parsed) return;
    const uri = `at://${event.did}/${COLLECTION}/${commit.rkey}`;

    this.entries.set(uri, { did: event.did, ...parsed });
    this.ensureProfile(event.did);
    this.schedulePersist();
    this.scheduleEmit();
  }

  // --- backfill -----------------------------------------------------------

  async runBackfill() {
    if (!this.started || this.backfillDone || this.backfillRunning) return;
    this.backfillRunning = true;
    this.error = "";
    let retryMs = 250;
    try {
      let processed = 0;
      while (this.queue.length && processed < DIDS_PER_STEP) {
        const did = this.queue.shift();
        processed++;
        try {
          await this.backfillDid(did);
        } catch (_) {
          // A broken PDS or oversized repo shouldn't stall the rest of the wall.
        }
        this.reposScanned++;
      }

      if (!this.queue.length && !this.reposExhausted) {
        for (let page = 0; page < REPO_PAGES_PER_STEP; page++) {
          const params = new URLSearchParams({ collection: COLLECTION, limit: "100" });
          if (this.cursor) params.set("cursor", this.cursor);
          const data = await xrpcJson(`${RELAY_URL}/xrpc/com.atproto.sync.listReposByCollection?${params}`);
          const repos = Array.isArray(data.repos) ? data.repos : [];
          for (const repo of repos) {
            const did = repo?.did;
            if (typeof did === "string" && !this.queued.has(did)) {
              this.queued.add(did);
              this.queue.push(did);
              this.reposSeen++;
            }
          }
          this.cursor = typeof data.cursor === "string" ? data.cursor : undefined;
          if (!this.cursor || !repos.length) {
            this.reposExhausted = true;
            break;
          }
        }
      }

      if (this.reposExhausted && !this.queue.length) this.backfillDone = true;
      this.schedulePersist();
    } catch (err) {
      this.error = "wall sync paused; retrying shortly";
      retryMs = 5000;
      console.warn("recant global wall backfill failed", err);
    } finally {
      this.backfillRunning = false;
      this.scheduleEmit();
      if (!this.backfillDone) setTimeout(() => this.runBackfill(), retryMs);
    }
  }

  async backfillDid(did) {
    const pds = await resolvePds(did);
    if (!pds) return;
    const { records } = await fetchRepoRecordsWithKeys(pds, did, COLLECTION);
    for (const r of records) {
      const parsed = fromApologyRecord(r.value);
      if (!parsed) continue;
      this.entries.set(r.uri, { did, ...parsed });
    }
    if (records.length) {
      this.ensureProfile(did);
      this.scheduleEmit();
    }
  }

  // --- profiles -------------------------------------------------------------

  ensureProfile(did) {
    if (this.profiles.has(did) || this.pendingProfiles.has(did)) return;
    this.pendingProfiles.add(did);
    this._profileQueue = this._profileQueue || [];
    this._profileQueue.push(did);
    if (!this._profileFlushTimer) {
      this._profileFlushTimer = setTimeout(() => {
        this._profileFlushTimer = null;
        this.flushProfileQueue();
      }, 200);
    }
  }

  async flushProfileQueue() {
    const dids = (this._profileQueue || []).splice(0);
    for (let i = 0; i < dids.length; i += PROFILE_BATCH) {
      const batch = dids.slice(i, i + PROFILE_BATCH);
      try {
        const u = new URL(`${PUB}/app.bsky.actor.getProfiles`);
        batch.forEach((d) => u.searchParams.append("actors", d));
        const res = await fetch(u);
        if (res.ok) {
          const data = await res.json();
          for (const p of data.profiles || []) {
            this.profiles.set(p.did, { handle: p.handle, displayName: p.displayName || p.handle, avatar: p.avatar || "" });
            this.pendingProfiles.delete(p.did);
          }
        }
      } catch (_) {
        // A failed profile batch just leaves those entries showing their bare DID.
      }
      for (const d of batch) this.pendingProfiles.delete(d);
    }
    this.scheduleEmit();
  }
}
