// network-index.js — network-wide view over every net.bisks.war.state record
// on the protocol, via com.atproto.sync.listReposByCollection (finds every
// repo holding the collection) + com.atproto.repo.getRecord for backfill,
// plus a live Jetstream subscription for anything written after the page
// loads. Copied and adapted from sites/steamtags/public/lib/global-index.js
// (the reference implementation for this pattern — see
// notes/ideas/pds-and-lexicons.md, "Tier 3: use listReposByCollection").
//
// war's state record is simpler than steamtags' or verdict's: the lexicon
// pins it to a single fixed rkey ("self") per repo, one lifetime scoreboard
// per player rather than many records — so backfill is one getRecord call
// per DID instead of a paginated listRecords scan.

const COLLECTION = "net.bisks.war.state";
const RELAY_URL = "https://bsky.network";
const PLC_DIRECTORY = "https://plc.directory";
const CACHE_KEY = "war:network-index:v1";

const MAX_ENTRIES = 40000;
const MIN_GAMES_FOR_RECORD_BOARD = 5;
const LEADERBOARD_SIZE = 8;
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
      (item) => item.id === "#atproto_pds" || item.type === "AtprotoPersonalDataServer"
    );
    return typeof service?.serviceEndpoint === "string" ? service.serviceEndpoint : null;
  } catch (_) {
    return null;
  }
}

function normaliseRecord(did, record) {
  if (!record || typeof record !== "object") return null;
  const wins = Number(record.wins);
  const losses = Number(record.losses);
  const draws = Number(record.draws);
  const gamesPlayed = Number(record.gamesPlayed);
  if (![wins, losses, draws, gamesPlayed].every(Number.isFinite)) return null;
  const rules = (record.lastResult && record.lastResult.rules) || (record.current && record.current.rules) || null;
  return {
    did,
    wins: Math.max(0, Math.round(wins)),
    losses: Math.max(0, Math.round(losses)),
    draws: Math.max(0, Math.round(draws)),
    gamesPlayed: Math.max(0, Math.round(gamesPlayed)),
    inProgress: !!record.current,
    rules: rules && typeof rules === "object" ? rules : null,
    updatedAt: typeof record.updatedAt === "string" ? Date.parse(record.updatedAt) || 0 : 0,
  };
}

export class GlobalIndex {
  constructor({ onUpdate } = {}) {
    this.onUpdate = typeof onUpdate === "function" ? onUpdate : () => {};
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

  refresh() {
    if (!this.started || this.backfillRunning) return;
    this.backfillDone = false;
    this.backfillReposExhausted = false;
    this.backfillCursor = undefined;
    this.backfillQueue = [];
    this.backfillQueued.clear();
    this.liveKeys.clear();
    this.error = "";
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
      ...this.buildBoards(),
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
      console.error("war network render failed", err);
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

    let changed = false;
    if (commit.operation === "delete") {
      changed = this.entries.delete(event.did);
    } else if (commit.operation === "create" || commit.operation === "update") {
      changed = this.applyRecord(event.did, commit.record, true);
    }
    if (changed) {
      this.liveKeys.add(event.did);
      this.lastUpdated = Date.now();
      this.schedulePersist();
      this.scheduleEmit();
    }
  }

  applyRecord(did, record, fromLive) {
    if (!fromLive && this.liveKeys.has(did)) return false;
    if (!record || typeof record !== "object") return false;
    const entry = normaliseRecord(did, record);
    if (!entry) return this.entries.delete(did);
    if (!this.entries.has(did) && this.entries.size >= MAX_ENTRIES) return false;
    this.entries.set(did, entry);
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
      console.warn("war network backfill failed", err);
    } finally {
      this.backfillRunning = false;
      this.scheduleEmit();
      if (!this.backfillDone && !this.paused) setTimeout(() => this.runBackfill(), retryMs);
    }
  }

  // Unlike steamtags/verdict, each repo has at most one record (fixed rkey
  // "self"), so a single getRecord call is enough — no listRecords paging.
  async backfillDid(did) {
    const pds = await resolvePds(did);
    if (!pds) return false;
    const base = pds.replace(/\/$/, "");
    const params = new URLSearchParams({ repo: did, collection: COLLECTION, rkey: "self" });
    try {
      const data = await xrpcJson(`${base}/xrpc/com.atproto.repo.getRecord?${params}`);
      return this.applyRecord(did, data.value, false);
    } catch (_) {
      return false;
    }
  }

  // The aggregate no single repo can see: how many people are out there
  // playing, how the network's house rules lean, and who's winning.
  buildBoards() {
    const totals = { players: 0, gamesPlayed: 0, wins: 0, losses: 0, draws: 0, inProgress: 0 };
    const ruleTally = { warCards: {}, aceRank: {}, midWarBust: {}, roundCap: {}, jokers: {} };
    const players = [];

    for (const entry of this.entries.values()) {
      totals.players++;
      totals.gamesPlayed += entry.gamesPlayed;
      totals.wins += entry.wins;
      totals.losses += entry.losses;
      totals.draws += entry.draws;
      if (entry.inProgress) totals.inProgress++;
      if (entry.rules) {
        for (const key of Object.keys(ruleTally)) {
          const val = entry.rules[key];
          if (val != null) ruleTally[key][val] = (ruleTally[key][val] || 0) + 1;
        }
      }
      if (entry.gamesPlayed > 0) players.push(entry);
    }

    const mostActive = [...players].sort((a, b) => b.gamesPlayed - a.gamesPlayed).slice(0, LEADERBOARD_SIZE);
    const bestRecord = players
      .filter((p) => p.gamesPlayed >= MIN_GAMES_FOR_RECORD_BOARD)
      .sort((a, b) => b.wins / b.gamesPlayed - a.wins / a.gamesPlayed || b.gamesPlayed - a.gamesPlayed)
      .slice(0, LEADERBOARD_SIZE);

    return { totals, ruleTally, mostActive, bestRecord };
  }
}
