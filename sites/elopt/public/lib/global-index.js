// global-index.js — network-wide view over elopt's two collections:
// net.bisks.elopt.optin (who has consented to be on the board — rkey is
// always "self", one record per repo) and net.bisks.elopt.vote (every battle
// call anyone's cast — one record per (voter, matchup, thread), see
// records.js's voteRkey). Same Tier 3 recipe as
// sites/rateyourbuild/public/lib/global-index.js (itself from
// sites/steamtags — notes/ideas/pds-and-lexicons.md): backfill via
// com.atproto.sync.listReposByCollection + com.atproto.repo.listRecords /
// getRecord, then a live Jetstream tail for anything written after load.
//
// The consent gate lives here, not just in the UI: computeElo() below only
// ever replays a vote when BOTH subjects are currently in the opted-in
// roster. An account that never opted in has no vote about it counted, ever
// — and an account that opts out drops out of every future replay
// immediately, even for battles that already happened.
//
// Per the 2026-08-25/2026-08-28 standing orders (prefer bulk reads over
// paginated cursor walks; page to exhaustion, no arbitrary cap on how much
// history gets walked) both backfills below run until listReposByCollection
// and every repo's own pages are genuinely exhausted.
// MAX_VOTES is a real memory cap (this all lives in the tab's heap), not a
// network cap.

const OPTIN_COLLECTION = "net.bisks.elopt.optin";
const VOTE_COLLECTION = "net.bisks.elopt.vote";
const JETSTREAM_URL = `wss://jetstream2.us-east.bsky.network/subscribe?wantedCollections=${OPTIN_COLLECTION}&wantedCollections=${VOTE_COLLECTION}`;
const RELAY_URL = "https://bsky.network";
const PLC_DIRECTORY = "https://plc.directory";
const CACHE_KEY = "elopt:global-index:v1";

const MAX_VOTES = 60000;
const BACKFILL_DIDS_PER_STEP = 15;
const BACKFILL_REPO_PAGES_PER_STEP = 2;
const START_ELO = 1000;
const K_FACTOR = 32;

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

function isDid(s) {
  return typeof s === "string" && s.startsWith("did:") && s.length < 256;
}

function normaliseVote(voterDid, rkey, record) {
  if (!record || typeof record !== "object") return null;
  const subjectA = record.subjectA;
  const subjectB = record.subjectB;
  const winner = record.winner;
  if (!isDid(subjectA) || !isDid(subjectB) || subjectA === subjectB) return null;
  if (winner !== subjectA && winner !== subjectB) return null;
  const thread = typeof record.thread === "string" ? record.thread.trim() : "";
  if (!thread.startsWith("at://")) return null;
  const createdAt = typeof record.createdAt === "string" ? Date.parse(record.createdAt) || 0 : 0;
  return { voterDid, rkey, subjectA, subjectB, winner, thread, createdAt };
}

// Pure standard-elo replay, no browser globals — takes any iterable of vote
// records ({ subjectA, subjectB, winner, createdAt }) and any iterable of
// currently-opted-in DIDs, and returns a Map<did, {did, elo, wins, losses}>.
// A vote is only ever counted when BOTH of its subjects are in `rosterDids`
// — this function *is* the consent enforcement, not a UI-level filter on
// top of it, so an opted-out account's past battles stop counting the
// moment it leaves the roster. Exported standalone so it's testable without
// a browser (see tests/elo.test.mjs) and reused by GlobalIndex.computeElo.
export function computeEloBoard(votes, rosterDids) {
  const roster = rosterDids instanceof Set ? rosterDids : new Set(rosterDids);
  const eligible = [];
  for (const v of votes) {
    if (roster.has(v.subjectA) && roster.has(v.subjectB)) eligible.push(v);
  }
  eligible.sort((a, b) => a.createdAt - b.createdAt);
  const board = new Map();
  const get = (did) => board.get(did) || { did, elo: START_ELO, wins: 0, losses: 0 };
  for (const v of eligible) {
    const loser = v.winner === v.subjectA ? v.subjectB : v.subjectA;
    const w = get(v.winner);
    const l = get(loser);
    const expectedW = 1 / (1 + Math.pow(10, (l.elo - w.elo) / 400));
    w.elo = Math.round(w.elo + K_FACTOR * (1 - expectedW));
    l.elo = Math.round(l.elo + K_FACTOR * (0 - (1 - expectedW)));
    w.wins += 1;
    l.losses += 1;
    board.set(v.winner, w);
    board.set(loser, l);
  }
  // Opted-in accounts with zero eligible battles still belong on the board,
  // at the starting elo — otherwise opting in would look like it did
  // nothing until someone actually battles you.
  for (const did of roster) if (!board.has(did)) board.set(did, get(did));
  return board;
}

export class GlobalIndex {
  constructor({ onUpdate, onLiveVote } = {}) {
    this.onUpdate = typeof onUpdate === "function" ? onUpdate : () => {};
    // Fired for a genuinely live (not backfilled) vote commit — lets the
    // battle UI react to "a vote just landed" without waiting on the next
    // debounced snapshot rebuild.
    this.onLiveVote = typeof onLiveVote === "function" ? onLiveVote : () => {};
    this.optins = new Map(); // did -> { did, createdAt }
    this.votes = new Map(); // `${voterDid}::${rkey}` -> vote
    this.liveKeys = new Set();
    this.lastUpdated = 0;
    this.socket = null;
    this.reconnectTimer = null;
    this.reconnectDelay = 1000;
    this.persistTimer = null;
    this.emitTimer = null;
    this.started = false;
    this.paused = false;

    this.optinRunning = false;
    this.optinDone = false;
    this.optinReposExhausted = false;
    this.optinCursor = undefined;
    this.optinQueue = [];
    this.optinQueued = new Set();

    this.voteRunning = false;
    this.voteDone = false;
    this.voteReposExhausted = false;
    this.voteCursor = undefined;
    this.voteQueue = [];
    this.voteQueued = new Set();

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
      this.runOptinBackfill();
      this.runVoteBackfill();
    }
  }

  isOptedIn(did) {
    return this.optins.has(did);
  }

  // Injects a record straight into the index before Jetstream has
  // necessarily echoed it back, so the acting user sees their own opt-in /
  // vote land instantly instead of waiting on the firehose round trip.
  applyOwnOptin(did, createdAtIso) {
    this.liveKeys.add(`optin::${did}`);
    this.optins.set(did, { did, createdAt: Date.parse(createdAtIso) || Date.now() });
    this.lastUpdated = Date.now();
    this.schedulePersist();
    this.emit();
  }
  applyOwnOptout(did) {
    this.liveKeys.add(`optin::${did}`);
    this.optins.delete(did);
    this.lastUpdated = Date.now();
    this.schedulePersist();
    this.emit();
  }
  applyOwnVote(voterDid, rkey, record) {
    const key = `${voterDid}::${rkey}`;
    this.liveKeys.add(`vote::${key}`);
    const vote = normaliseVote(voterDid, rkey, record);
    if (vote) this.votes.set(key, vote);
    this.lastUpdated = Date.now();
    this.schedulePersist();
    this.emit();
  }

  // Synchronous read of whatever's known right now — callers don't wait on
  // backfill, they just get progressively more complete over time.
  snapshot() {
    return {
      updatedAt: this.lastUpdated || null,
      rosterSize: this.optins.size,
      voteCount: this.votes.size,
      connected: !!this.socket && this.socket.readyState === WebSocket.OPEN,
      backfillDone: this.optinDone && this.voteDone,
      backfillActive: this.optinRunning || this.voteRunning,
      error: this.error,
      roster: new Set(this.optins.keys()),
      elo: this.computeElo(),
    };
  }

  // Elo is always a full replay, not an incremental update — cheap even at
  // tens of thousands of votes, and it's the only way "an account opted
  // out" can retroactively drop every battle it was in without hand-written
  // reversal logic. Only votes where BOTH subjects are currently opted in
  // are ever counted; this is the actual consent enforcement, not just a
  // UI-level filter. The actual math lives in the standalone computeEloBoard
  // below so it's testable without a browser (see tests/elo.test.mjs).
  computeElo() {
    return computeEloBoard(this.votes.values(), this.optins.keys());
  }

  pause() {
    this.paused = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    if (this.socket) {
      try {
        this.socket.close();
      } catch (_) {}
    }
    this.socket = null;
    this.emit();
  }

  resume() {
    this.paused = false;
    if (!this.started) return;
    this.connect();
    this.runOptinBackfill();
    this.runVoteBackfill();
    this.emit();
  }

  restoreCache() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if (!parsed) return;
      for (const o of parsed.optins || []) {
        if (o && typeof o.did === "string") this.optins.set(o.did, o);
      }
      for (const v of (parsed.votes || []).slice(0, MAX_VOTES)) {
        if (!v || typeof v.voterDid !== "string" || typeof v.rkey !== "string") continue;
        const normalised = normaliseVote(v.voterDid, v.rkey, v);
        if (normalised) this.votes.set(`${v.voterDid}::${v.rkey}`, normalised);
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
          JSON.stringify({
            savedAt: this.lastUpdated,
            optins: Array.from(this.optins.values()),
            votes: Array.from(this.votes.values()),
          }),
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
      console.error("elopt global render failed", err);
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
      } catch (_) {}
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
    if (!commit || typeof event.did !== "string" || typeof commit.rkey !== "string") return;

    let changed = false;
    if (commit.collection === OPTIN_COLLECTION && commit.rkey === "self") {
      const key = `optin::${event.did}`;
      this.liveKeys.add(key);
      if (commit.operation === "delete") {
        changed = this.optins.delete(event.did);
      } else if (commit.operation === "create" || commit.operation === "update") {
        this.optins.set(event.did, { did: event.did, createdAt: Date.parse(commit.record?.createdAt) || Date.now() });
        changed = true;
      }
    } else if (commit.collection === VOTE_COLLECTION) {
      const voteKey = `${event.did}::${commit.rkey}`;
      const key = `vote::${voteKey}`;
      this.liveKeys.add(key);
      if (commit.operation === "delete") {
        changed = this.votes.delete(voteKey);
      } else if (commit.operation === "create" || commit.operation === "update") {
        const vote = normaliseVote(event.did, commit.rkey, commit.record);
        if (vote) {
          this.votes.set(voteKey, vote);
          changed = true;
          this.onLiveVote(vote);
        }
      }
    } else {
      return;
    }

    if (changed) {
      this.lastUpdated = Date.now();
      this.schedulePersist();
      this.scheduleEmit();
    }
  }

  async runOptinBackfill() {
    if (!this.started || this.paused || this.optinDone || this.optinRunning) return;
    this.optinRunning = true;
    let retryMs = 250;
    try {
      let processed = 0;
      while (this.optinQueue.length && processed < BACKFILL_DIDS_PER_STEP) {
        const did = this.optinQueue.shift();
        processed++;
        try {
          if (await this.backfillOptinDid(did)) this.lastUpdated = Date.now();
        } catch (_) {
          // A broken PDS should not stall other repositories.
        }
      }

      if (!this.optinQueue.length && !this.optinReposExhausted) {
        for (let page = 0; page < BACKFILL_REPO_PAGES_PER_STEP; page++) {
          const params = new URLSearchParams({ collection: OPTIN_COLLECTION, limit: "100" });
          if (this.optinCursor) params.set("cursor", this.optinCursor);
          const data = await xrpcJson(`${RELAY_URL}/xrpc/com.atproto.sync.listReposByCollection?${params}`);
          const repos = Array.isArray(data.repos) ? data.repos : [];
          for (const repo of repos) {
            const did = repo?.did;
            if (typeof did === "string" && !this.optinQueued.has(did)) {
              this.optinQueued.add(did);
              this.optinQueue.push(did);
            }
          }
          this.optinCursor = typeof data.cursor === "string" ? data.cursor : undefined;
          if (!this.optinCursor || !repos.length) {
            this.optinReposExhausted = true;
            break;
          }
        }
      }

      if (this.optinReposExhausted && !this.optinQueue.length) this.optinDone = true;
      this.schedulePersist();
    } catch (err) {
      this.error = "roster backfill paused; retrying shortly";
      retryMs = 5000;
      console.warn("elopt optin backfill failed", err);
    } finally {
      this.optinRunning = false;
      this.scheduleEmit();
      if (!this.optinDone && !this.paused) setTimeout(() => this.runOptinBackfill(), retryMs);
    }
  }

  async backfillOptinDid(did) {
    // Singleton rkey ("self") — one getRecord confirms current membership,
    // no pagination needed. A 404 (deleted before backfill reached it) is
    // just "not opted in," not an error.
    const key = `optin::${did}`;
    if (this.liveKeys.has(key)) return false;
    const pds = await resolvePds(did);
    if (!pds) return false;
    const base = pds.replace(/\/$/, "");
    const params = new URLSearchParams({ repo: did, collection: OPTIN_COLLECTION, rkey: "self" });
    const res = await fetch(`${base}/xrpc/com.atproto.repo.getRecord?${params}`);
    if (!res.ok) return false;
    const data = await res.json();
    if (!data?.value || data.value.consent !== true) return false;
    this.optins.set(did, { did, createdAt: Date.parse(data.value.createdAt) || 0 });
    return true;
  }

  async runVoteBackfill() {
    if (!this.started || this.paused || this.voteDone || this.voteRunning) return;
    this.voteRunning = true;
    let retryMs = 250;
    try {
      let processed = 0;
      while (this.voteQueue.length && processed < BACKFILL_DIDS_PER_STEP) {
        const did = this.voteQueue.shift();
        processed++;
        try {
          if (await this.backfillVoteDid(did)) this.lastUpdated = Date.now();
        } catch (_) {
          // A broken PDS should not stall other repositories.
        }
      }

      if (!this.voteQueue.length && !this.voteReposExhausted) {
        for (let page = 0; page < BACKFILL_REPO_PAGES_PER_STEP; page++) {
          const params = new URLSearchParams({ collection: VOTE_COLLECTION, limit: "100" });
          if (this.voteCursor) params.set("cursor", this.voteCursor);
          const data = await xrpcJson(`${RELAY_URL}/xrpc/com.atproto.sync.listReposByCollection?${params}`);
          const repos = Array.isArray(data.repos) ? data.repos : [];
          for (const repo of repos) {
            const did = repo?.did;
            if (typeof did === "string" && !this.voteQueued.has(did)) {
              this.voteQueued.add(did);
              this.voteQueue.push(did);
            }
          }
          this.voteCursor = typeof data.cursor === "string" ? data.cursor : undefined;
          if (!this.voteCursor || !repos.length) {
            this.voteReposExhausted = true;
            break;
          }
        }
      }

      if (this.voteReposExhausted && !this.voteQueue.length) this.voteDone = true;
      this.schedulePersist();
    } catch (err) {
      this.error = "vote history backfill paused; retrying shortly";
      retryMs = 5000;
      console.warn("elopt vote backfill failed", err);
    } finally {
      this.voteRunning = false;
      this.scheduleEmit();
      if (!this.voteDone && !this.paused) setTimeout(() => this.runVoteBackfill(), retryMs);
    }
  }

  async backfillVoteDid(did) {
    const pds = await resolvePds(did);
    if (!pds) return false;
    const base = pds.replace(/\/$/, "");
    let cursor;
    let changed = false;
    for (;;) {
      const params = new URLSearchParams({ repo: did, collection: VOTE_COLLECTION, limit: "100" });
      if (cursor) params.set("cursor", cursor);
      const data = await xrpcJson(`${base}/xrpc/com.atproto.repo.listRecords?${params}`);
      const records = Array.isArray(data.records) ? data.records : [];
      for (const record of records) {
        const rkey = typeof record?.uri === "string" ? record.uri.split("/").pop() : "";
        const key = `vote::${did}::${rkey}`;
        if (!rkey || this.liveKeys.has(key)) continue;
        const vote = normaliseVote(did, rkey, record.value);
        if (vote) {
          this.votes.set(`${did}::${rkey}`, vote);
          changed = true;
        }
      }
      cursor = typeof data.cursor === "string" ? data.cursor : undefined;
      if (!cursor || !records.length) break;
    }
    return changed;
  }
}
