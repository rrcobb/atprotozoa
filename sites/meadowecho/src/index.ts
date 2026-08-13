// meadowecho Worker — served at the root of meadowecho.bisks.net.
//
// @fromthewestmeadow.com's thread described a visualization that PCA-reduces
// text-embedding vectors to 3D so posts (theirs and their mutuals') that are
// semantically close cluster visibly together. They then asked buildthis for
// "your own implementation" of the underlying idea, live: watch the open
// firehose and surface whichever posts, right now, read as closest to their
// own last 50 posts.
//
// This Worker skips the PCA (that's for a 3D *picture*; we just want a
// ranked list) but keeps the real ingredient — actual sentence embeddings
// (Cloudflare Workers AI, cosine similarity) — rather than a keyword/TF-IDF
// stand-in. The EchoTracker Durable Object below does three things:
//   1. Periodically re-embeds the target's last ~100 posts and averages them
//      into one centroid vector (their "neighborhood" in embedding space).
//   2. Holds a live WebSocket to Jetstream (same out-bound-fetch pattern as
//      sites/mootstream's ActivityTracker), filtering the torrent of posts
//      down to a plausible, non-spammy, English, one-per-author-per-cooldown
//      trickle.
//   3. On a timer, embeds a small batch of that trickle at once (one Workers
//      AI call per batch, not per post — the whole firehose is far more
//      volume than any embeddings budget survives) and keeps a rolling
//      top-K of the highest cosine-similarity posts seen in the last few
//      hours.
//
// No login, no writes, nothing stored about anyone except the ranked list of
// public post text/handles already visible on the open firehose.

interface DurableObjectId {
  toString(): string;
}
interface DurableObjectStub {
  fetch(request: Request): Promise<Response>;
}
interface DurableObjectNamespace {
  idFromName(name: string): DurableObjectId;
  get(id: DurableObjectId): DurableObjectStub;
}
interface DurableObjectStorage {
  get<T = unknown>(key: string): Promise<T | undefined>;
  put(entries: Record<string, unknown>): Promise<void>;
  setAlarm(time: number | Date): Promise<void>;
  deleteAlarm(): Promise<void>;
}
interface DurableObjectState {
  storage: DurableObjectStorage;
  blockConcurrencyWhile<T>(fn: () => Promise<T>): Promise<T>;
}

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
  ECHO: DurableObjectNamespace;
  AI: { run: (model: string, inputs: unknown) => Promise<unknown> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      const stub = env.ECHO.get(env.ECHO.idFromName("singleton"));
      return stub.fetch(request);
    }
    return env.ASSETS.fetch(request);
  },
};

// ---- config -----------------------------------------------------------------

const JETSTREAM_URL =
  "https://jetstream2.us-east.bsky.network/subscribe?wantedCollections=app.bsky.feed.post";
const PUB = "https://public.api.bsky.app/xrpc";

const TARGET_HANDLE = "fromthewestmeadow.com";
// Resolved fresh on boot; this is only the fallback if resolution ever fails
// (see sites/clusterpedia's SEED_ARTICLES, which documents the same DID).
const TARGET_DID_FALLBACK = "did:plc:qttqvv4n3vqqu35qajhcuqlq";

const EMBED_MODEL = "@cf/baai/bge-base-en-v1.5";
const EMBED_BATCH_CHUNK = 20; // texts per Workers AI call when embedding the target's own posts

const TARGET_REFRESH_MS = 6 * 60 * 60 * 1000; // refresh the target centroid infrequently
const ALARM_MS = 60 * 1000; // reconnect check + slow candidate draining
const DEMAND_LEASE_MS = 2 * 60 * 1000; // stop the firehose and AI work when nobody is looking
const CANDIDATE_BATCH = 6; // candidates embedded per alarm tick (one Workers AI call)
const MAX_QUEUE = 20; // small backlog; drop old candidates rather than catch up
const AUTHOR_COOLDOWN_MS = 5 * 60 * 1000; // one candidate per author per cooldown window
const MATCH_WINDOW_MS = 6 * 60 * 60 * 1000; // matches older than this age out of the leaderboard
const MATCH_FLOOR = 0.3; // cosine similarity below this isn't worth keeping at all
const MAX_MATCHES = 40; // leaderboard size kept in storage / served to the client
const MIN_TEXT_LEN = 20;
const STORAGE_FLUSH_EVERY_TICKS = 3; // persist matches/stats every N alarm ticks, not every tick

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "access-control-allow-origin": "*" },
  });
}

// ---- text filtering (borrowed/adapted from sites/semanticmute) --------------

function looksLikeSpam(text: string): boolean {
  if (/#nowplaying|listen live|onelink\.to/i.test(text)) return true;
  if (/🛒|shop now|buy now|↗️ ?buy/i.test(text)) return true;
  if (/prime members|\$\d+\.\d{2}\b|amzn\.to/i.test(text)) return true;
  const hashtags = (text.match(/#/g) || []).length;
  if (hashtags >= 4) return true;
  return false;
}

function isEnglish(langs: unknown): boolean {
  if (!Array.isArray(langs) || langs.length === 0) return true; // undeclared: let it through
  return langs.some((l) => String(l).toLowerCase().split("-")[0] === "en");
}

// ---- embeddings ---------------------------------------------------------------

// Workers AI embedding models reply in a couple of observed shapes across
// versions — sometimes { data: number[][] }, sometimes the array directly.
// Coerce defensively rather than assume one, same spirit as thread-heirloom's
// coerceModelOutput for its (differently-shaped) chat model.
function coerceEmbeddings(raw: unknown, expected: number): number[][] {
  const data = (raw as { data?: unknown })?.data ?? raw;
  if (!Array.isArray(data)) throw new Error("embedding response wasn't an array");
  // A single-vector response for a single input sometimes comes back
  // unwrapped (number[] instead of number[][]) — detect and re-wrap.
  if (expected === 1 && typeof data[0] === "number") return [data as number[]];
  return data as number[][];
}

function normalize(v: number[]): number[] {
  let sumSq = 0;
  for (const x of v) sumSq += x * x;
  const norm = Math.sqrt(sumSq) || 1;
  return v.map((x) => x / norm);
}

function dot(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length && i < b.length; i++) s += a[i] * b[i];
  return s;
}

async function embedTexts(env: Env, texts: string[]): Promise<number[][]> {
  if (!texts.length) return [];
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += EMBED_BATCH_CHUNK) {
    const chunk = texts.slice(i, i + EMBED_BATCH_CHUNK);
    const raw = await env.AI.run(EMBED_MODEL, { text: chunk });
    const vecs = coerceEmbeddings(raw, chunk.length);
    for (const v of vecs) out.push(normalize(v));
  }
  return out;
}

// ---- target post history (public AppView, anonymous) -------------------------

interface TargetPost {
  text: string;
  url: string;
  createdAt: string;
}

async function resolveTargetDid(): Promise<string> {
  try {
    const r = await fetch(
      `${PUB}/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(TARGET_HANDLE)}`,
    );
    if (r.ok) {
      const d = (await r.json()) as { did?: string };
      if (d.did) return d.did;
    }
  } catch {
    // fall through to fallback
  }
  return TARGET_DID_FALLBACK;
}

// One page (limit=50) is enough for the small centroid; a couple of extra
// pages backfill when reposts/media-only posts eat into that count, capped
// so a media-heavy stretch can't spiral into an unbounded fetch loop.
async function fetchTargetPosts(did: string, handle: string): Promise<TargetPost[]> {
  const out: TargetPost[] = [];
  let cursor = "";
  for (let page = 0; page < 3 && out.length < 50; page++) {
    const u = new URL(`${PUB}/app.bsky.feed.getAuthorFeed`);
    u.searchParams.set("actor", did);
    u.searchParams.set("limit", "50");
    if (cursor) u.searchParams.set("cursor", cursor);
    let d: any;
    try {
      const r = await fetch(u.toString());
      if (!r.ok) break;
      d = await r.json();
    } catch {
      break;
    }
    for (const it of d.feed || []) {
      if (it.reason) continue; // skip reposts
      const rec = it.post?.record;
      const text = typeof rec?.text === "string" ? rec.text.trim() : "";
      if (!text || text.length < MIN_TEXT_LEN) continue;
      const rkey = String(it.post?.uri || "").split("/").pop();
      out.push({
        text,
        url: `https://bsky.app/profile/${handle}/post/${rkey}`,
        createdAt: rec.createdAt || it.post?.indexedAt || "",
      });
      if (out.length >= 50) break;
    }
    cursor = d.cursor;
    if (!cursor) break;
  }
  return out;
}

// ---- durable object -----------------------------------------------------------

interface TargetSnapshot {
  did: string;
  handle: string;
  posts: TargetPost[]; // parallel to `embeddings`
  embeddings: number[][];
  centroid: number[];
  refreshedAt: number;
}

interface Match {
  text: string;
  did: string;
  handle: string;
  avatar: string;
  url: string;
  score: number;
  closest: { text: string; url: string } | null;
  matchedAt: number;
}

interface Candidate {
  text: string;
  did: string;
  rkey: string;
  ts: number;
}

interface Stats {
  seen: number; // every app.bsky.feed.post create observed on the firehose
  filtered: number; // passed the cheap filters, entered the embed queue
  embedded: number; // actually sent through Workers AI
}

export class EchoTracker {
  private state: DurableObjectState;
  private env: Env;
  private ready: Promise<void>;
  private ws: any = null;
  private reconnectDelay = 1000;

  private target: TargetSnapshot | null = null;
  private targetRefreshing = false;
  private matches: Match[] = [];
  private stats: Stats = { seen: 0, filtered: 0, embedded: 0 };
  private queue: Candidate[] = [];
  private lastSeenByAuthor: Map<string, number> = new Map();
  private profileCache: Map<string, { handle: string; avatar: string }> = new Map();
  private tickCount = 0;
  private lastUpdated = 0;
  private lastDemandAt = 0;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
    this.ready = this.state.blockConcurrencyWhile(async () => {
      const [target, matches, stats, lastUpdated] = await Promise.all([
        this.state.storage.get<TargetSnapshot>("target"),
        this.state.storage.get<Match[]>("matches"),
        this.state.storage.get<Stats>("stats"),
        this.state.storage.get<number>("lastUpdated"),
      ]);
      this.target = target ?? null;
      this.matches = matches ?? [];
      this.stats = stats ?? { seen: 0, filtered: 0, embedded: 0 };
      this.lastUpdated = lastUpdated ?? 0;
    });
  }

  private hasDemand(): boolean {
    return Date.now() - this.lastDemandAt < DEMAND_LEASE_MS;
  }

  private closeSocket(): void {
    const ws = this.ws;
    this.ws = null;
    try {
      ws?.close();
    } catch {
      // already closed
    }
  }

  private async armAlarm(delay = ALARM_MS): Promise<void> {
    const deadline = this.lastDemandAt + DEMAND_LEASE_MS;
    await this.state.storage.setAlarm(Math.min(Date.now() + delay, deadline));
  }

  // ---- target refresh ---------------------------------------------------------

  private needsRefresh(): boolean {
    if (!this.target) return true;
    return Date.now() - this.target.refreshedAt > TARGET_REFRESH_MS;
  }

  private async refreshTarget(): Promise<void> {
    if (this.targetRefreshing) return;
    this.targetRefreshing = true;
    try {
      const did = await resolveTargetDid();
      const posts = await fetchTargetPosts(did, TARGET_HANDLE);
      if (!posts.length) return; // AppView hiccup — keep the stale snapshot rather than go empty
      const embeddings = await embedTexts(this.env, posts.map((p) => p.text));
      if (embeddings.length !== posts.length) return; // partial batch failure — don't corrupt the snapshot
      const centroid = normalize(
        embeddings.reduce((acc, v) => acc.map((x, i) => x + v[i]), new Array(embeddings[0].length).fill(0)),
      );
      this.target = { did, handle: TARGET_HANDLE, posts, embeddings, centroid, refreshedAt: Date.now() };
      await this.state.storage.put({ target: this.target });
    } catch {
      // leave the previous snapshot (if any) in place — a flaky refresh
      // shouldn't blank out a working leaderboard
    } finally {
      this.targetRefreshing = false;
    }
  }

  // ---- firehose ----------------------------------------------------------------
  // Workers connect OUT via fetch() + an Upgrade header (the documented
  // Cloudflare pattern), not the browser `new WebSocket(url)` constructor —
  // same as sites/mootstream's ActivityTracker.
  private async connectSocket(): Promise<void> {
    if (!this.hasDemand()) return;
    try {
      const resp: any = await fetch(JETSTREAM_URL, { headers: { Upgrade: "websocket" } });
      const ws = resp.webSocket;
      if (!ws) throw new Error("jetstream didn't upgrade");
      ws.accept();
      this.ws = ws;
      this.reconnectDelay = 1000;
      ws.addEventListener("message", (ev: any) => {
        try {
          this.handleMessage(String(ev.data));
        } catch {
          // one bad message shouldn't kill the stream
        }
      });
      ws.addEventListener("close", () => {
        if (this.ws === ws) this.ws = null;
        this.scheduleReconnect();
      });
      ws.addEventListener("error", () => {
        try {
          ws.close();
        } catch {
          // already closing
        }
      });
    } catch {
      this.ws = null;
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (!this.hasDemand()) return;
    const delay = this.reconnectDelay;
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30000);
    setTimeout(() => {
      if (!this.hasDemand()) return;
      this.connectSocket().catch(() => {});
    }, delay);
  }

  private wsOpen(): boolean {
    return !!this.ws && this.ws.readyState === 1; // WebSocket.OPEN
  }

  private handleMessage(raw: string): void {
    let evt: any;
    try {
      evt = JSON.parse(raw);
    } catch {
      return;
    }
    if (evt.kind !== "commit") return;
    const commit = evt.commit;
    if (!commit || commit.operation !== "create") return;
    if (commit.collection && commit.collection !== "app.bsky.feed.post") return;
    const rec = commit.record;
    if (!rec || typeof rec.text !== "string") return;
    const text = rec.text.trim();
    const did = String(evt.did || "");
    if (!text || !did) return;

    this.stats.seen++;
    if (text.length < MIN_TEXT_LEN) return;
    if (!isEnglish(rec.langs)) return;
    if (looksLikeSpam(text)) return;
    // Never compare the target's own posts against themselves.
    if (this.target && did === this.target.did) return;

    const now = Date.now();
    const lastFromAuthor = this.lastSeenByAuthor.get(did);
    if (lastFromAuthor != null && now - lastFromAuthor < AUTHOR_COOLDOWN_MS) return;
    this.lastSeenByAuthor.set(did, now);

    this.stats.filtered++;
    this.queue.push({ text, did, rkey: commit.rkey, ts: now });
    if (this.queue.length > MAX_QUEUE) this.queue.splice(0, this.queue.length - MAX_QUEUE);
  }

  // ---- profile lookups (for display only — best-effort, never blocks scoring) --

  private async fetchProfile(did: string): Promise<{ handle: string; avatar: string }> {
    const cached = this.profileCache.get(did);
    if (cached) return cached;
    // A long-lived DO would otherwise accumulate one entry per distinct
    // poster ever seen, forever — cheap insurance against that slow leak.
    if (this.profileCache.size > 5000) this.profileCache.clear();
    try {
      const r = await fetch(`${PUB}/app.bsky.actor.getProfile?actor=${encodeURIComponent(did)}`);
      if (r.ok) {
        const p = (await r.json()) as { handle?: string; avatar?: string };
        const out = { handle: p.handle || did, avatar: p.avatar || "" };
        this.profileCache.set(did, out);
        return out;
      }
    } catch {
      // fall through
    }
    const out = { handle: did, avatar: "" };
    this.profileCache.set(did, out);
    return out;
  }

  // Same unbounded-growth concern as profileCache: without this, a
  // long-lived DO accumulates one entry per distinct author ever seen.
  // Anything older than the cooldown window is dead weight for the check
  // in handleMessage anyway, so it's safe to drop.
  private pruneAuthorCooldowns(): void {
    const cutoff = Date.now() - AUTHOR_COOLDOWN_MS;
    for (const [did, ts] of this.lastSeenByAuthor) {
      if (ts < cutoff) this.lastSeenByAuthor.delete(did);
    }
  }

  // ---- batch scoring -------------------------------------------------------------

  private pruneMatches(): void {
    const cutoff = Date.now() - MATCH_WINDOW_MS;
    this.matches = this.matches
      .filter((m) => m.matchedAt >= cutoff)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_MATCHES);
  }

  private async drainQueue(): Promise<void> {
    if (!this.target || !this.queue.length) return;
    const batch = this.queue.splice(0, CANDIDATE_BATCH);
    let vectors: number[][];
    try {
      vectors = await embedTexts(this.env, batch.map((c) => c.text));
    } catch {
      return; // Workers AI hiccup — the batch is simply skipped, not retried
    }
    const target = this.target;
    for (let i = 0; i < batch.length; i++) {
      const vec = vectors[i];
      if (!vec) continue;
      this.stats.embedded++;
      const score = dot(vec, target.centroid);
      if (score < MATCH_FLOOR) continue;

      let bestIdx = -1;
      let bestScore = -Infinity;
      for (let j = 0; j < target.embeddings.length; j++) {
        const s = dot(vec, target.embeddings[j]);
        if (s > bestScore) {
          bestScore = s;
          bestIdx = j;
        }
      }
      const closest = bestIdx >= 0 ? target.posts[bestIdx] : null;

      const c = batch[i];
      const profile = await this.fetchProfile(c.did);
      this.matches.push({
        text: c.text,
        did: c.did,
        handle: profile.handle,
        avatar: profile.avatar,
        url: `https://bsky.app/profile/${profile.handle}/post/${c.rkey}`,
        score,
        closest: closest ? { text: closest.text, url: closest.url } : null,
        matchedAt: c.ts,
      });
    }
    this.pruneMatches();
  }

  // ---- alarm: heartbeat + queue drain ---------------------------------------------

  async alarm(): Promise<void> {
    await this.ready;
    if (!this.hasDemand()) {
      this.closeSocket();
      await this.state.storage.deleteAlarm();
      return;
    }
    if (!this.wsOpen()) this.connectSocket().catch(() => {});
    if (this.needsRefresh()) this.refreshTarget().catch(() => {});

    await this.drainQueue();
    this.pruneAuthorCooldowns();
    this.lastUpdated = Date.now();
    this.tickCount++;
    if (this.tickCount % STORAGE_FLUSH_EVERY_TICKS === 0) {
      await this.state.storage.put({
        matches: this.matches,
        stats: this.stats,
        lastUpdated: this.lastUpdated,
      });
    }
    if (this.hasDemand()) {
      await this.armAlarm();
    } else {
      this.closeSocket();
      await this.state.storage.deleteAlarm();
    }
  }

  // ---- http -------------------------------------------------------------------

  async fetch(request: Request): Promise<Response> {
    await this.ready;

    const url = new URL(request.url);
    if (url.pathname !== "/api/matches") return json({ error: "not found" }, 404);

    this.lastDemandAt = Date.now();
    await this.armAlarm();
    if (!this.wsOpen()) this.connectSocket().catch(() => {});
    if (this.needsRefresh()) this.refreshTarget().catch(() => {});

    return json({
      updatedAt: this.lastUpdated || null,
      target: this.target
        ? {
            handle: this.target.handle,
            did: this.target.did,
            postCount: this.target.posts.length,
            refreshedAt: this.target.refreshedAt,
          }
        : null,
      stats: { ...this.stats, queueLen: this.queue.length },
      matches: this.matches,
    });
  }
}
