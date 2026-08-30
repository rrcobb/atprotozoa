// global-wall.js — the real public haunt wall, network-wide.
//
// net.bisks.duohaunt.checkin (see ../../lexicons) already declares that
// "duohaunt's server reads back off the PDS ... before showing someone on
// the wall," but the actual shared-wall backend it describes was retired at
// some point (see the "Historical shared-wall implementation intentionally
// retired" dead code app.js used to carry) — almost certainly during the
// Durable-Object/KV cost-wall cleanup, same shape as catspace's /directory
// and hyperobject before their own fixes. This rebuilds it frontend-only,
// same recipe as sites/steamtags and sites/socialcredit's global index:
//
//   1. com.atproto.sync.listReposByCollection finds every repo that has ever
//      written a check-in — a paginated walk over *repos*, which has no bulk
//      alternative (2026-08-25 standing order in
//      sites/buildthis/builder/INSTRUCTIONS.md).
//   2. For each repo, one com.atproto.sync.getRepo CAR download
//      (./car.js) pulls that repo's *entire* check-in history in one
//      request instead of paginating com.atproto.repo.listRecords —
//      "prefer bulk reads," same order.
//   3. Every check-in in a repo's history is folded, oldest-first, through
//      the exact same tier/streak/clears logic app.js's maybeCheckin() uses
//      for your own local status, so a repo's wall entry matches what that
//      person would see for themselves.
//
// Only overdue/totalCards/createdAt ever leave a repo (that's the entire
// checkin record) — handle/displayName/avatar come from a separate batched
// app.bsky.actor.getProfiles lookup, same as sites/socialcredit's sc-client.js.
//
// A live wss://jetstream subscription layers on top so a check-in written
// while the wall is open around, no reload needed.

import { fetchRepoRecordsWithKeys } from "./car.js";

const COLLECTION = "net.bisks.duohaunt.checkin";
const JETSTREAM_URL = `wss://jetstream2.us-east.bsky.network/subscribe?wantedCollections=${COLLECTION}`;
const RELAY_URL = "https://bsky.network";
const PLC_DIRECTORY = "https://plc.directory";
const PUB = "https://api.bsky.app/xrpc";
const CACHE_KEY = "duohaunt:wall-cache:v1";

const TIER_COUNT = 5; // mirrors app.js's TIERS array
const TIER_STEP_MS = 6 * 60 * 60 * 1000; // mirrors app.js's tier math (6h per step)
const MAX_ENTRIES = 5000; // backstop against unbounded browser memory, not a visible-content cap — nowhere near duohaunt's real opt-in count
const REPO_PAGES_PER_STEP = 2;
const DIDS_PER_STEP = 3; // CAR downloads are heavier than a listRecords page; keep steps small so the tab stays responsive
const STEP_DELAY_MS = 400;
const PROFILE_BATCH = 25; // app.bsky.actor.getProfiles' own cap

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

function fromCheckinRecord(r) {
  if (!r || typeof r !== "object") return null;
  const overdue = Number(r.overdue);
  const totalCards = Number(r.totalCards);
  if (!Number.isFinite(overdue) || !Number.isFinite(totalCards)) return null;
  const createdAtMs = Date.parse(r.createdAt);
  return {
    overdue: Math.max(0, Math.round(overdue)),
    totalCards: Math.max(0, Math.round(totalCards)),
    createdAtMs: Number.isFinite(createdAtMs) ? createdAtMs : Date.now(),
  };
}

// One fold step — identical shape to app.js's maybeCheckin() reducer, so a
// repo's derived state matches what that person's own browser would have
// stored after the same check-in.
function foldStep(state, c) {
  const t = c.createdAtMs;
  const overdueSince = c.overdue ? (state?.overdueSince ?? t) : null;
  const clears = c.overdue === 0 && state?.overdue > 0 ? (state.clears || 0) + 1 : state?.clears || 0;
  return {
    overdue: c.overdue,
    totalCards: c.totalCards,
    overdueSince,
    clears,
    hauntedSince: state?.hauntedSince ?? t,
    lastCheckinAt: t,
  };
}

function deriveStatus(checkins) {
  let state = null;
  for (const c of checkins) state = foldStep(state, c);
  return state;
}

// Tier is computed against real current time, not frozen at the last
// check-in — "it climbs on its own" per duohaunt's own confession text, so
// a wall visitor sees someone's tier keep rising even if that person hasn't
// opened the app since.
export function tierFor(state, now = Date.now()) {
  if (!state || !state.overdueSince) return 0;
  return Math.min(TIER_COUNT - 1, 1 + Math.floor((now - state.overdueSince) / TIER_STEP_MS));
}

export class GlobalWall {
  constructor({ onUpdate } = {}) {
    this.onUpdate = typeof onUpdate === "function" ? onUpdate : () => {};
    this.states = new Map(); // did -> derived status
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
        if (!e || typeof e.did !== "string") continue;
        const { did, ...state } = e;
        this.states.set(did, state);
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
        const entries = Array.from(this.states.entries())
          .slice(0, MAX_ENTRIES)
          .map(([did, state]) => ({ did, ...state }));
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
      console.error("duohaunt global wall render failed", err);
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
    const now = Date.now();
    const entries = Array.from(this.states.entries()).map(([did, state]) => {
      const profile = this.profiles.get(did);
      return {
        did,
        handle: profile?.handle || did,
        displayName: profile?.displayName || profile?.handle || did,
        avatar: profile?.avatar || "",
        overdue: state.overdue,
        totalCards: state.totalCards,
        clears: state.clears,
        hauntedSince: state.hauntedSince,
        lastCheckinAt: state.lastCheckinAt,
        tier: tierFor(state, now),
      };
    });
    entries.sort((a, b) => b.tier - a.tier || b.overdue - a.overdue || b.lastCheckinAt - a.lastCheckinAt);
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
    const parsed = fromCheckinRecord(commit.record);
    if (!parsed) return;

    const next = foldStep(this.states.get(event.did) || null, parsed);
    this.states.set(event.did, next);
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
      console.warn("duohaunt global wall backfill failed", err);
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
    const checkins = records.map((r) => fromCheckinRecord(r.value)).filter(Boolean);
    if (!checkins.length) return;
    checkins.sort((a, b) => a.createdAtMs - b.createdAtMs);
    this.states.set(did, deriveStatus(checkins));
    this.ensureProfile(did);
    this.scheduleEmit();
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
