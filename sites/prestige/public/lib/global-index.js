// global-index.js — data source for /hall.html, the network-wide directory
// of every prestige chain anyone's ever declared. Same backfill+live recipe
// as sites/kolpelor/public/lib/global-index.js (listReposByCollection to find
// every repo holding net.bisks.prestige.link, then a targeted read per repo,
// kept current with a Jetstream tail) — trimmed and reshaped for this site's
// record, which is `key: "tid"` (an account can hold several link records
// over its life, one per hand-off) rather than kolpelor's singleton "self".
//
// The added wrinkle index.html's single-chain lookup doesn't have: a `prev`
// or `next` can point at a DID that hasn't written its own record yet (the
// schema allows declaring a hand-off before the successor exists). Any such
// DID gets queued for its own lookup the moment it's referenced, so it shows
// up as a "not declared yet" stub until (if ever) it writes its own record.

const COLLECTION = "net.bisks.prestige.link";
const JETSTREAM_URL = `wss://jetstream2.us-east.bsky.network/subscribe?wantedCollections=${COLLECTION}`;
const RELAY_URL = "https://bsky.network";
const PLC_DIRECTORY = "https://plc.directory";
const PUB_API = "https://api.bsky.app/xrpc";
const CACHE_KEY = "prestige:global-index:v1";
const MAX_ENTRIES = 5000;
const BACKFILL_DIDS_PER_STEP = 15;
const BACKFILL_REPO_PAGES_PER_STEP = 2;

async function jget(url) {
  const r = await fetch(url, { headers: { Accept: "application/json" } });
  if (!r.ok) throw new Error(`${url} -> ${r.status}`);
  return r.json();
}

async function didDoc(did) {
  if (did.startsWith("did:plc:")) {
    const r = await fetch(`${PLC_DIRECTORY}/${did}`);
    return r.ok ? r.json() : null;
  }
  if (did.startsWith("did:web:")) {
    const domain = did.slice("did:web:".length).replace(/:/g, "/");
    const r = await fetch(`https://${domain}/.well-known/did.json`);
    return r.ok ? r.json() : null;
  }
  return null;
}

async function resolveIdentity(did) {
  try {
    const doc = await didDoc(did);
    const service = (doc?.service || []).find(
      (s) => s.id === "#atproto_pds" || s.type === "AtprotoPersonalDataServer",
    );
    const pdsUrl = typeof service?.serviceEndpoint === "string" ? service.serviceEndpoint : null;
    const aka = (doc?.alsoKnownAs || []).find((a) => typeof a === "string" && a.startsWith("at://"));
    return { pdsUrl, handle: aka ? aka.slice("at://".length) : did };
  } catch {
    return { pdsUrl: null, handle: did };
  }
}

async function getProfile(did) {
  try {
    return await jget(`${PUB_API}/app.bsky.actor.getProfile?actor=${encodeURIComponent(did)}`);
  } catch {
    return null;
  }
}

// Every net.bisks.prestige.link record an account currently holds, merged
// last-write-wins per field (mirrors index.html's mergeLinks).
async function fetchOwnLinks(pdsUrl, did) {
  if (!pdsUrl) return [];
  const out = [];
  let cursor;
  for (let p = 0; p < 5; p++) {
    const params = new URLSearchParams({ repo: did, collection: COLLECTION, limit: "100" });
    if (cursor) params.set("cursor", cursor);
    let d;
    try {
      d = await jget(`${pdsUrl.replace(/\/$/, "")}/xrpc/com.atproto.repo.listRecords?${params}`);
    } catch {
      break;
    }
    const records = d.records || [];
    out.push(...records);
    cursor = d.cursor;
    if (!cursor || !records.length) break;
  }
  return out;
}

function mergeLinks(records) {
  const sorted = [...records].sort(
    (a, b) => new Date(a.value?.createdAt || 0) - new Date(b.value?.createdAt || 0),
  );
  const m = { prev: null, next: null, generation: null, followersAtLink: null, note: null, createdAt: null };
  for (const r of sorted) {
    const v = r.value || {};
    if (v.prev) m.prev = v.prev;
    if (v.next) m.next = v.next;
    if (typeof v.generation === "number") m.generation = v.generation;
    if (typeof v.followersAtLink === "number") m.followersAtLink = v.followersAtLink;
    if (v.note) m.note = v.note;
    if (v.createdAt) m.createdAt = v.createdAt;
  }
  return { ...m, recordCount: records.length };
}

export class GlobalIndex {
  constructor({ onUpdate } = {}) {
    this.onUpdate = typeof onUpdate === "function" ? onUpdate : () => {};
    this.entries = new Map(); // did -> merged entry
    this.identityCache = new Map();
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
      accountCount: this.entries.size,
      connected: !!this.socket && this.socket.readyState === WebSocket.OPEN,
      backfillDone: this.backfillDone,
      backfillActive: this.backfillRunning,
      error: this.error,
      entries: this.entries,
    };
  }

  pause() {
    this.paused = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    if (this.socket) {
      try {
        this.socket.close();
      } catch {
        // Already gone.
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
    } catch {
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
      } catch {
        // The live index remains available in memory if the cache is too large.
      }
    }, 500);
  }

  emit() {
    try {
      this.onUpdate(this.snapshot());
    } catch (err) {
      console.error("prestige global render failed", err);
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
    } catch {
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
      } catch {
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
    } catch {
      return;
    }
    if (event.kind !== "commit") return;
    const commit = event.commit;
    if (!commit || commit.collection !== COLLECTION || typeof event.did !== "string") return;
    this.liveDids.add(event.did);
    // A live event can be one of several TID records an account holds, and
    // fields are merged last-write-wins across all of them — simplest
    // correct move is to re-fetch that account's whole link set rather than
    // patch in just this one record.
    this.loadAccount(event.did, true).catch(() => {});
  }

  queueDid(did) {
    if (!did || typeof did !== "string" || this.backfillQueued.has(did)) return;
    this.backfillQueued.add(did);
    this.backfillQueue.push(did);
  }

  async loadAccount(did, fromLive) {
    let identity = this.identityCache.get(did);
    if (!identity) {
      identity = await resolveIdentity(did);
      this.identityCache.set(did, identity);
    }
    const [records, profile] = await Promise.all([
      fetchOwnLinks(identity.pdsUrl, did),
      getProfile(did),
    ]);
    const merged = mergeLinks(records);
    if (merged.prev) this.queueDid(merged.prev);
    if (merged.next) this.queueDid(merged.next);
    const entry = {
      did,
      handle: profile?.handle || identity.handle,
      avatar: profile?.avatar || null,
      followersCount: typeof profile?.followersCount === "number" ? profile.followersCount : null,
      ...merged,
    };
    if (!this.entries.has(did) && this.entries.size >= MAX_ENTRIES) return entry;
    this.entries.set(did, entry);
    this.lastUpdated = Date.now();
    this.schedulePersist();
    if (fromLive || this.backfillDone) this.scheduleEmit();
    return entry;
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
          await this.loadAccount(did, false);
        } catch {
          // A broken PDS should not stall the rest of the queue.
        }
      }

      if (!this.backfillQueue.length && !this.backfillReposExhausted) {
        for (let page = 0; page < BACKFILL_REPO_PAGES_PER_STEP; page++) {
          const params = new URLSearchParams({ collection: COLLECTION, limit: "100" });
          if (this.backfillCursor) params.set("cursor", this.backfillCursor);
          const data = await jget(`${RELAY_URL}/xrpc/com.atproto.sync.listReposByCollection?${params}`);
          const repos = Array.isArray(data.repos) ? data.repos : [];
          for (const repo of repos) this.queueDid(repo?.did);
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
      this.error = "network scan paused; retrying shortly";
      retryMs = 5000;
      console.warn("prestige global backfill failed", err);
    } finally {
      this.backfillRunning = false;
      this.scheduleEmit();
      if (!this.backfillDone && !this.paused) setTimeout(() => this.runBackfill(), retryMs);
    }
  }
}

// --- chain reconstruction ----------------------------------------------------

// Groups the flat did->entry map into ordered chains by walking prev/next
// edges. A referenced did with no entry yet (declared as a hand-off target
// that hasn't written its own record) still gets a stub node so the chain
// shows where it's headed.
export function computeChains(entries) {
  const visited = new Set();
  const chains = [];

  function stub(did) {
    return { did, handle: did, avatar: null, followersCount: null, recordCount: 0, declared: false };
  }

  function get(did) {
    const e = entries.get(did);
    return e ? { ...e, declared: true } : stub(did);
  }

  for (const did of entries.keys()) {
    if (visited.has(did)) continue;

    // Collect the connected component via BFS over prev/next.
    const component = new Set([did]);
    const queue = [did];
    while (queue.length) {
      const cur = queue.shift();
      const e = entries.get(cur);
      if (!e) continue;
      for (const nb of [e.prev, e.next]) {
        if (nb && !component.has(nb)) {
          component.add(nb);
          queue.push(nb);
        }
      }
    }
    for (const d of component) visited.add(d);
    if (component.size === 0) continue;

    // Find a head: a node in the component with no prev, or whose prev
    // points outside the component (shouldn't happen, but be defensive).
    let headDid = [...component].find((d) => {
      const e = entries.get(d);
      return !e || !e.prev || !component.has(e.prev);
    });
    if (!headDid) headDid = [...component][0];

    // Walk forward from the head via next, capped the same as index.html's
    // single-chain lookup (buildChain's capHops) to guard against a
    // malformed prev/next cycle spinning forever.
    const ordered = [];
    const seen = new Set();
    let cur = headDid;
    for (let i = 0; i < 25 && cur && !seen.has(cur); i++) {
      seen.add(cur);
      ordered.push(get(cur));
      const e = entries.get(cur);
      cur = e?.next;
    }
    // Anything in the component the forward walk didn't reach (a branch, or
    // a broken link) still gets shown, appended in generation order.
    const leftover = [...component]
      .filter((d) => !seen.has(d))
      .map(get)
      .sort((a, b) => (a.generation || 0) - (b.generation || 0));

    chains.push({ nodes: [...ordered, ...leftover], size: component.size });
  }

  chains.sort((a, b) => b.size - a.size || (b.nodes[0]?.createdAt || "").localeCompare(a.nodes[0]?.createdAt || ""));
  return chains;
}
