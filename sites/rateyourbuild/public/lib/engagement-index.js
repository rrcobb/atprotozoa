// engagement-index.js — network-wide view over every net.bisks.rateyourbuild.vote
// and net.bisks.rateyourbuild.reply record: upvotes/downvotes and replies on
// other people's rating/review records. Same shape as global-index.js (this
// site's own rating index, copied from sites/steamtags) — listReposByCollection
// + listRecords backfill, plus a live Jetstream subscription — just tracking
// two smaller collections instead of one, since both are "engagement on a
// review" and the UI always wants them together.
//
// Per the 2026-08-25/2026-08-28 standing orders (prefer bulk reads over
// paginated cursor walks; don't cap a walk just out of reflexive caution),
// backfill runs until every listReposByCollection page and every repo's
// listRecords page are genuinely exhausted for both collections —
// BACKFILL_*_PER_STEP only throttles work per tick, it never stops the walk
// early. MAX_ENTRIES is a real memory cap (this all lives in the tab's
// heap), not a network cap.

const VOTE_COLLECTION = "net.bisks.rateyourbuild.vote";
const REPLY_COLLECTION = "net.bisks.rateyourbuild.reply";
const JETSTREAM_URL = `wss://jetstream2.us-east.bsky.network/subscribe?wantedCollections=${VOTE_COLLECTION}&wantedCollections=${REPLY_COLLECTION}`;
const RELAY_URL = "https://bsky.network";
const PLC_DIRECTORY = "https://plc.directory";
const CACHE_KEY = "rateyourbuild:engagement-index:v1";

const MAX_ENTRIES = 60000;
const BACKFILL_DIDS_PER_STEP = 15;
const BACKFILL_REPO_PAGES_PER_STEP = 2;
const BACKFILL_RECORD_PAGES_PER_DID = 3;

// Two distinct key shapes, don't conflate them:
//   - reviewKey (subject::reviewer) — a grouping bucket for tallying votes
//     or listing replies from every different voter/replier targeting the
//     same review; never touches the wire.
//   - recordKey (subject.reviewer) — the actual atproto record key each
//     voter/replier writes their own record under (constructed the same way
//     in public/index.html's writeVote/writeReply). applyOwn*/own*/removeOwn*
//     below must use this shape — it's what a live Jetstream commit or a
//     backfilled listRecords entry will carry as commit.rkey, and a mismatch
//     here means the optimistic local write and the real echoed record land
//     under two different map keys instead of one, double-counting the vote.
function reviewKey(subject, reviewer) {
  return `${subject}::${reviewer}`;
}
function recordKey(subject, reviewer) {
  return `${subject}.${reviewer}`;
}

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

function normaliseVote(did, rkey, record) {
  if (!record || typeof record !== "object") return null;
  const subject = typeof record.subject === "string" ? record.subject.trim() : "";
  const reviewer = typeof record.reviewer === "string" ? record.reviewer.trim() : "";
  const value = Number(record.value);
  if (!subject || !reviewer || (value !== 1 && value !== -1)) return null;
  return {
    did,
    rkey,
    subject,
    reviewer,
    value,
    votedAt: typeof record.votedAt === "string" ? Date.parse(record.votedAt) || 0 : 0,
  };
}

function normaliseReply(did, rkey, record) {
  if (!record || typeof record !== "object") return null;
  const subject = typeof record.subject === "string" ? record.subject.trim() : "";
  const reviewer = typeof record.reviewer === "string" ? record.reviewer.trim() : "";
  const text = typeof record.text === "string" ? record.text.trim().slice(0, 1500) : "";
  if (!subject || !reviewer || !text) return null;
  return {
    did,
    rkey,
    subject,
    reviewer,
    text,
    createdAt: typeof record.createdAt === "string" ? Date.parse(record.createdAt) || 0 : 0,
  };
}

export class EngagementIndex {
  constructor({ onUpdate, onLiveReply } = {}) {
    this.onUpdate = typeof onUpdate === "function" ? onUpdate : () => {};
    this.onLiveReply = typeof onLiveReply === "function" ? onLiveReply : () => {};
    this.votes = new Map(); // did::rkey -> vote
    this.replies = new Map(); // did::rkey -> reply
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
    this.backfillReposExhausted = { [VOTE_COLLECTION]: false, [REPLY_COLLECTION]: false };
    this.backfillCursor = { [VOTE_COLLECTION]: undefined, [REPLY_COLLECTION]: undefined };
    this.backfillQueue = []; // [{did, collection}]
    this.backfillQueued = new Set(); // `${did}::${collection}`
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
      backfillDone: this.backfillDone,
      backfillActive: this.backfillRunning,
      error: this.error,
      votesByReview: this.buildVoteTallies(),
      repliesByReview: this.buildReplyLists(),
    };
  }

  // My own vote on a review, or null — used so the UI can highlight the
  // pressed button immediately without waiting on a full snapshot rebuild.
  ownVote(myDid, subject, reviewer) {
    return this.votes.get(`${myDid}::${recordKey(subject, reviewer)}`) || null;
  }
  ownReply(myDid, subject, reviewer) {
    return this.replies.get(`${myDid}::${recordKey(subject, reviewer)}`) || null;
  }

  // Injects a just-written vote/reply straight into the index (before
  // Jetstream has necessarily echoed it back), same pattern as
  // global-index.js's applyOwn.
  applyOwnVote(did, subject, reviewer, value, votedAtIso) {
    const rkey = recordKey(subject, reviewer);
    const key = `${did}::${rkey}`;
    this.liveKeys.add(`vote:${key}`);
    this.votes.set(key, { did, rkey, subject, reviewer, value, votedAt: Date.parse(votedAtIso) || Date.now() });
    this.lastUpdated = Date.now();
    this.schedulePersist();
    this.emit();
  }
  applyOwnReply(did, subject, reviewer, text, createdAtIso) {
    const rkey = recordKey(subject, reviewer);
    const key = `${did}::${rkey}`;
    this.liveKeys.add(`reply:${key}`);
    this.replies.set(key, { did, rkey, subject, reviewer, text, createdAt: Date.parse(createdAtIso) || Date.now() });
    this.lastUpdated = Date.now();
    this.schedulePersist();
    this.emit();
  }
  // Un-voting (clicking the same direction again) deletes the record rather
  // than writing a 0 — the lexicon only allows -1/1, so "no vote" means "no
  // record", same as how re-rating never writes a null score.
  removeOwnVote(did, subject, reviewer) {
    const rkey = recordKey(subject, reviewer);
    const key = `${did}::${rkey}`;
    this.liveKeys.add(`vote:${key}`);
    this.votes.delete(key);
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
      if (!parsed) return;
      for (const entry of (parsed.votes || []).slice(0, MAX_ENTRIES)) {
        const normalised = normaliseVote(entry.did, entry.rkey, entry);
        if (normalised) this.votes.set(`${entry.did}::${entry.rkey}`, normalised);
      }
      for (const entry of (parsed.replies || []).slice(0, MAX_ENTRIES)) {
        const normalised = normaliseReply(entry.did, entry.rkey, entry);
        if (normalised) this.replies.set(`${entry.did}::${entry.rkey}`, normalised);
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
            votes: Array.from(this.votes.values()),
            replies: Array.from(this.replies.values()),
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
      console.error("rateyourbuild engagement render failed", err);
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
    if (!commit || typeof event.did !== "string" || typeof commit.rkey !== "string") return;
    if (commit.collection !== VOTE_COLLECTION && commit.collection !== REPLY_COLLECTION) return;

    const key = `${event.did}::${commit.rkey}`;
    const liveKey = `${commit.collection === VOTE_COLLECTION ? "vote" : "reply"}:${key}`;
    this.liveKeys.add(liveKey);
    let changed = false;
    if (commit.operation === "delete") {
      const map = commit.collection === VOTE_COLLECTION ? this.votes : this.replies;
      changed = map.delete(key);
    } else if (commit.operation === "create" || commit.operation === "update") {
      changed = this.applyRecord(commit.collection, event.did, commit.rkey, commit.record, true);
      if (changed && commit.collection === REPLY_COLLECTION) {
        const reply = this.replies.get(key);
        if (reply) this.onLiveReply({ did: event.did, subject: reply.subject, reviewer: reply.reviewer, text: reply.text });
      }
    }
    if (changed) {
      this.lastUpdated = Date.now();
      this.schedulePersist();
      this.scheduleEmit();
    }
  }

  applyRecord(collection, did, rkey, record, fromLive) {
    const key = `${did}::${rkey}`;
    const isVote = collection === VOTE_COLLECTION;
    const liveKey = `${isVote ? "vote" : "reply"}:${key}`;
    if (!fromLive && this.liveKeys.has(liveKey)) return false;
    const map = isVote ? this.votes : this.replies;
    const entry = isVote ? normaliseVote(did, rkey, record) : normaliseReply(did, rkey, record);
    if (!entry) return map.delete(key);
    if (!map.has(key) && map.size >= MAX_ENTRIES) return false;
    map.set(key, entry);
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
        const { did, collection } = this.backfillQueue.shift();
        processed++;
        try {
          if (await this.backfillDid(did, collection)) this.lastUpdated = Date.now();
        } catch (_) {
          // A broken PDS should not stall other repositories.
        }
      }

      for (const collection of [VOTE_COLLECTION, REPLY_COLLECTION]) {
        if (this.backfillReposExhausted[collection]) continue;
        for (let page = 0; page < BACKFILL_REPO_PAGES_PER_STEP; page++) {
          const params = new URLSearchParams({ collection, limit: "100" });
          if (this.backfillCursor[collection]) params.set("cursor", this.backfillCursor[collection]);
          const data = await xrpcJson(`${RELAY_URL}/xrpc/com.atproto.sync.listReposByCollection?${params}`);
          const repos = Array.isArray(data.repos) ? data.repos : [];
          for (const repo of repos) {
            const did = repo?.did;
            const qKey = `${did}::${collection}`;
            if (typeof did === "string" && !this.backfillQueued.has(qKey)) {
              this.backfillQueued.add(qKey);
              this.backfillQueue.push({ did, collection });
            }
          }
          this.backfillCursor[collection] = typeof data.cursor === "string" ? data.cursor : undefined;
          if (!this.backfillCursor[collection] || !repos.length) {
            this.backfillReposExhausted[collection] = true;
            break;
          }
        }
      }

      const reposDone = this.backfillReposExhausted[VOTE_COLLECTION] && this.backfillReposExhausted[REPLY_COLLECTION];
      if (reposDone && !this.backfillQueue.length) this.backfillDone = true;
      this.schedulePersist();
    } catch (err) {
      this.error = "engagement backfill paused; retrying shortly";
      retryMs = 5000;
      console.warn("rateyourbuild engagement backfill failed", err);
    } finally {
      this.backfillRunning = false;
      this.scheduleEmit();
      if (!this.backfillDone && !this.paused) setTimeout(() => this.runBackfill(), retryMs);
    }
  }

  async backfillDid(did, collection) {
    const pds = await resolvePds(did);
    if (!pds) return false;
    const base = pds.replace(/\/$/, "");
    let cursor;
    let changed = false;
    for (let page = 0; page < BACKFILL_RECORD_PAGES_PER_DID; page++) {
      const params = new URLSearchParams({ repo: did, collection, limit: "100" });
      if (cursor) params.set("cursor", cursor);
      const data = await xrpcJson(`${base}/xrpc/com.atproto.repo.listRecords?${params}`);
      const records = Array.isArray(data.records) ? data.records : [];
      for (const record of records) {
        const rkey = typeof record?.uri === "string" ? record.uri.split("/").pop() : "";
        if (rkey && this.applyRecord(collection, did, rkey, record.value, false)) changed = true;
      }
      cursor = typeof data.cursor === "string" ? data.cursor : undefined;
      if (!cursor || !records.length) break;
    }
    return changed;
  }

  buildVoteTallies() {
    const byReview = new Map(); // reviewKey -> {up, down, net, byVoter: Map<did, value>}
    for (const vote of this.votes.values()) {
      const rk = reviewKey(vote.subject, vote.reviewer);
      let stats = byReview.get(rk);
      if (!stats) {
        stats = { up: 0, down: 0, net: 0, byVoter: new Map() };
        byReview.set(rk, stats);
      }
      stats.byVoter.set(vote.did, vote.value);
      if (vote.value === 1) stats.up += 1;
      else stats.down += 1;
      stats.net = stats.up - stats.down;
    }
    return byReview;
  }

  buildReplyLists() {
    const byReview = new Map(); // reviewKey -> [reply, ...] sorted oldest first
    for (const reply of this.replies.values()) {
      const rk = reviewKey(reply.subject, reply.reviewer);
      let list = byReview.get(rk);
      if (!list) {
        list = [];
        byReview.set(rk, list);
      }
      list.push(reply);
    }
    for (const list of byReview.values()) list.sort((a, b) => a.createdAt - b.createdAt);
    return byReview;
  }
}
