// global-index.js — network-wide view over every net.bisks.fellowshipcast.ballot
// record on the protocol: com.atproto.sync.listReposByCollection (finds every
// repo holding the collection) + com.atproto.repo.listRecords for backfill,
// plus a live Jetstream subscription for anything written after the page
// loads. Copied and adapted from sites/steamtags/public/lib/global-index.js,
// the reference implementation for this pattern (see
// notes/ideas/pds-and-lexicons.md, "Tier 3: use listReposByCollection").
//
// Each record is keyed by did alone (rkey is always "self" — one ballot per
// voter), so re-casting a ballot overwrites in place and never double-counts.
//
// Per the 2026-08-25/2026-08-28 standing orders (prefer bulk reads over
// paginated cursor walks; don't cap a walk just out of reflexive caution),
// backfillDid below walks every listRecords page for a repo rather than
// stopping after a fixed page count — steamtags' original version capped at
// 5 pages "just in case," which would only ever matter here if a voter's
// repo somehow held hundreds of same-rkey ballot revisions, which it can't
// (putRecord upserts in place). Walking to exhaustion costs nothing extra in
// the normal case and costs nothing to leave uncapped.
// MAX_ENTRIES is a real memory cap (this all lives in the tab's heap), not a
// network cap.

const COLLECTION = "net.bisks.fellowshipcast.ballot";
const JETSTREAM_URL = `wss://jetstream2.us-east.bsky.network/subscribe?wantedCollections=${COLLECTION}`;
const RELAY_URL = "https://bsky.network";
const PLC_DIRECTORY = "https://plc.directory";
const CACHE_KEY = "fellowshipcast:global-index:v1";

// Keep in sync with the CHARACTERS/MODELS constants in index.html — a
// record is only counted if every character key resolves to a known id, so
// a future rename here just quietly stops counting old ballots for that
// character rather than crashing anything.
export const CHARACTERS = [
  { id: "gandalf", name: "Gandalf" },
  { id: "aragorn", name: "Aragorn" },
  { id: "frodo", name: "Frodo Baggins" },
  { id: "sam", name: "Samwise Gamgee" },
  { id: "merry", name: "Merry Brandybuck" },
  { id: "pippin", name: "Pippin Took" },
  { id: "boromir", name: "Boromir" },
  { id: "legolas", name: "Legolas" },
  { id: "gimli", name: "Gimli" },
];
export const MODELS = [
  { id: "claude-opus", name: "Claude Opus" },
  { id: "claude-sonnet", name: "Claude Sonnet" },
  { id: "claude-haiku", name: "Claude Haiku" },
  { id: "gpt-5", name: "GPT-5" },
  { id: "gpt-5-mini", name: "GPT-5 mini" },
  { id: "gemini-3-pro", name: "Gemini 3 Pro" },
  { id: "gemini-3-flash", name: "Gemini 3 Flash" },
  { id: "llama-4", name: "Llama 4" },
  { id: "mistral-large", name: "Mistral Large" },
  { id: "grok-5", name: "Grok 5" },
  { id: "deepseek-v4", name: "DeepSeek V4" },
  { id: "command-r-plus", name: "Command R+" },
];
const CHAR_IDS = new Set(CHARACTERS.map((c) => c.id));
const MODEL_IDS = new Set(MODELS.map((m) => m.id));

const MAX_ENTRIES = 40000;
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
      (item) => item.id === "#atproto_pds" || item.type === "AtprotoPersonalDataServer",
    );
    return typeof service?.serviceEndpoint === "string" ? service.serviceEndpoint : null;
  } catch (_) {
    return null;
  }
}

// A ballot only counts the character/model pairs that are actually
// recognised — an older or foreign-shaped record just contributes fewer
// pairs rather than being thrown out entirely.
function normaliseRecord(did, record) {
  if (!record || typeof record !== "object") return null;
  const casting = Array.isArray(record.casting) ? record.casting : [];
  const picks = {};
  for (const entry of casting) {
    if (!entry || typeof entry !== "object") continue;
    const character = typeof entry.character === "string" ? entry.character : "";
    const model = typeof entry.model === "string" ? entry.model : "";
    if (CHAR_IDS.has(character) && MODEL_IDS.has(model)) picks[character] = model;
  }
  if (!Object.keys(picks).length) return null;
  const updatedAt = typeof record.updatedAt === "string" ? Date.parse(record.updatedAt) || 0 : 0;
  return { did, picks, updatedAt };
}

export class GlobalIndex {
  constructor({ onUpdate } = {}) {
    this.onUpdate = typeof onUpdate === "function" ? onUpdate : () => {};
    this.entries = new Map(); // did -> { did, picks, updatedAt }
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
    return {
      updatedAt: this.lastUpdated || null,
      voterCount: this.entries.size,
      connected: !!this.socket && this.socket.readyState === WebSocket.OPEN,
      backfillDone: this.backfillDone,
      backfillActive: this.backfillRunning,
      error: this.error,
      boards: this.buildBoards(),
    };
  }

  // Injects a just-written ballot straight into the index (before Jetstream
  // has necessarily echoed it back), so the voter sees their own tally
  // update instantly instead of waiting on the firehose round trip.
  applyOwn(did, casting) {
    const entry = normaliseRecord(did, { casting, updatedAt: new Date().toISOString() });
    if (!entry) return;
    this.liveKeys.add(did);
    this.entries.set(did, entry);
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
        if (!entry || typeof entry.did !== "string" || !entry.picks) continue;
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
      console.error("fellowshipcast global render failed", err);
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
    if (commit.rkey !== "self") return;

    this.liveKeys.add(event.did);
    let changed = false;
    if (commit.operation === "delete") {
      changed = this.entries.delete(event.did);
    } else if (commit.operation === "create" || commit.operation === "update") {
      changed = this.applyRecord(event.did, commit.record, true);
    }
    if (changed) {
      this.lastUpdated = Date.now();
      this.schedulePersist();
      this.scheduleEmit();
    }
  }

  applyRecord(did, record, fromLive) {
    if (!fromLive && this.liveKeys.has(did)) return false;
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
      console.warn("fellowshipcast global backfill failed", err);
    } finally {
      this.backfillRunning = false;
      this.scheduleEmit();
      if (!this.backfillDone && !this.paused) setTimeout(() => this.runBackfill(), retryMs);
    }
  }

  // One ballot per voter (fixed rkey "self"), so a single listRecords page
  // covers almost every repo — but this still walks every page to
  // exhaustion rather than assuming that, per the repo's "prefer bulk reads,
  // don't cap out of reflexive caution" standing orders.
  async backfillDid(did) {
    const pds = await resolvePds(did);
    if (!pds) return false;
    const base = pds.replace(/\/$/, "");
    let cursor;
    let changed = false;
    for (;;) {
      const params = new URLSearchParams({ repo: did, collection: COLLECTION, limit: "100" });
      if (cursor) params.set("cursor", cursor);
      const data = await xrpcJson(`${base}/xrpc/com.atproto.repo.listRecords?${params}`);
      const records = Array.isArray(data.records) ? data.records : [];
      for (const record of records) {
        const rkey = typeof record?.uri === "string" ? record.uri.split("/").pop() : "";
        if (rkey === "self" && this.applyRecord(did, record.value, false)) changed = true;
      }
      cursor = typeof data.cursor === "string" ? data.cursor : undefined;
      if (!cursor || !records.length) break;
    }
    return changed;
  }

  // character id -> sorted [{ model, count }] tallies, most-cast model first.
  buildBoards() {
    const byCharacter = new Map(CHARACTERS.map((c) => [c.id, new Map()]));
    for (const entry of this.entries.values()) {
      for (const [character, model] of Object.entries(entry.picks)) {
        const tally = byCharacter.get(character);
        if (!tally) continue;
        tally.set(model, (tally.get(model) || 0) + 1);
      }
    }
    const boards = {};
    for (const [character, tally] of byCharacter.entries()) {
      const total = Array.from(tally.values()).reduce((a, b) => a + b, 0);
      boards[character] = {
        total,
        tallies: Array.from(tally.entries())
          .map(([model, count]) => ({ model, count }))
          .sort((a, b) => b.count - a.count),
      };
    }
    return boards;
  }
}
