// ratioed Worker — ratioed.bisks.net
//
// @goose.art asked for a dashboard of the most ratioed posts on Bluesky in the
// last hour, dunce cap on the worst offender's avatar. "Ratioed" (Twitter-era
// slang): a post whose replies badly outnumber its likes — the room showed up
// to argue, not to applaud.
//
// There's no "give me all recent posts" endpoint on the AppView — searchPosts
// is administratively blocked for anonymous callers (see sites/trigrams'
// notes/71), and building an authenticated proxy needs a secret this bot can't
// mint for a brand-new site mid-build. So instead: watch the live firehose
// (Jetstream) for root-level posts, sample a slice of them, and check each
// one's real like/reply counts a few minutes later via the public,
// UNAUTHENTICATED AppView (getPosts/getProfile — confirmed to work with no
// login, only searchPosts is gated). Score replies-vs-likes, keep a rolling
// ~1 hour leaderboard.
//
// All of that lives in ONE Durable Object (name "global") — the check queue +
// the live leaderboard are exactly the kind of single-writer rolling state
// notes/10-architecture.md calls out Durable Objects for. Shape borrowed from
// sites/the-place's Canvas DO: hand-declared Env/DO interfaces, no
// @cloudflare/workers-types dependency (house style: self-contained deps).

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
}
interface DurableObjectState {
  storage: DurableObjectStorage;
  blockConcurrencyWhile<T>(fn: () => Promise<T>): Promise<T>;
}

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
  TRACKER: DurableObjectNamespace;
}

// Mounted at bisks.net/ratioed/ — strip the mount prefix before routing, so the
// /api/* check and the DO + ASSETS all see root-relative paths (the assets dir
// and the DO have no idea they aren't at the domain root). The client fetches
// /ratioed/api/leaderboard (see public/index.html). See
// notes/40-new-site-playbook.md.
const PREFIX = "/ratioed";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === PREFIX) {
      url.pathname = PREFIX + "/";
      return Response.redirect(url.toString(), 308);
    }
    // Only strip when the prefix is actually present — on the subdomain
    // requests arrive without it, and an unconditional slice would chop
    // the front off short paths ("/app.js" -> "") so every asset would
    // silently serve index.html.
    if (url.pathname.startsWith(PREFIX + "/")) {
      url.pathname = url.pathname.slice(PREFIX.length) || "/";
    }
    const stripped = new Request(url, request);
    if (url.pathname.startsWith("/api/")) {
      const id = env.TRACKER.idFromName("global");
      const stub = env.TRACKER.get(id);
      return stub.fetch(stripped);
    }
    return env.ASSETS.fetch(stripped);
  },
};

// ---- config ----------------------------------------------------------------
// Plain https URL — Jetstream is reached the documented Workers way (fetch()
// with an Upgrade header, not the `new WebSocket(url)` constructor), see
// connectSocket() below.
const JETSTREAM_URL =
  "https://jetstream2.us-east.bsky.network/subscribe?wantedCollections=app.bsky.feed.post";
const APPVIEW = "https://public.api.bsky.app/xrpc";

const WINDOW_MS = 60 * 60 * 1000; // the rolling window the dashboard covers
const CHECK_DELAY_MS = 6 * 60 * 1000; // give a post ~6 min to accumulate reactions before checking it
const ALARM_MS = 20 * 1000; // tick cadence — also the reconnect heartbeat
const MAX_QUEUE = 4000; // safety valve: drop new candidates if the check backlog balloons
const MAX_CHECKS_PER_TICK = 300; // 12 getPosts batches of 25 — cheap, well under subrequest limits
const REFRESH_TOP_N = 20; // re-check the shown leaderboard's numbers every tick, so they stay live
const MIN_REPLIES = 3; // don't call 2 replies / 0 likes a "ratio" — needs real volume
const LEADERBOARD_SIZE = 20;
const SAMPLE_KEEP_1_OF = 3; // only queue every Nth qualifying post — bounds the check rate

interface Candidate {
  uri: string;
  did: string;
  rkey: string;
  text: string;
  createdAt: number;
  dueAt: number;
}

interface Checked {
  uri: string;
  did: string;
  rkey: string;
  handle: string;
  displayName: string;
  avatar: string;
  text: string;
  createdAt: number;
  likeCount: number;
  replyCount: number;
  repostCount: number;
  imgThumb: string | null;
  score: number;
  checkedAt: number;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// Cheap gate for obviously automated / spammy posts — trimmed from
// sites/trigrams' looksLikeSpam, same idea: don't let bot noise crowd the
// leaderboard, doesn't need to be exhaustive.
function looksLikeSpam(text: string): boolean {
  if (/#nowplaying|listen live|onelink\.to/i.test(text)) return true;
  if (/shop now|buy now|amzn\.to|prime members|\$\d+\.\d{2}\b/i.test(text)) return true;
  const hashtags = (text.match(/#/g) || []).length;
  if (hashtags >= 4) return true;
  return false;
}

// Pull a preview image out of a hydrated PostView embed, same shape as
// sites/favstar's embedImage() — the firehose only carries raw blob refs, but
// getPosts returns the fully-resolved CDN thumb, so this only runs at check time.
function embedImage(post: any): string | null {
  const e = post && post.embed;
  if (!e) return null;
  const t = e.$type || "";
  if (t.includes("images#view") && e.images && e.images[0]) return e.images[0].thumb || null;
  if (t.includes("recordWithMedia#view") && e.media && e.media.images && e.media.images[0]) {
    return e.media.images[0].thumb || null;
  }
  if (t.includes("external#view") && e.external && e.external.thumb) return e.external.thumb || null;
  if (t.includes("video#view") && e.thumbnail) return e.thumbnail || null;
  return null;
}

export class RatioTracker {
  private state: DurableObjectState;
  private ready: Promise<void>;
  private checkQueue: Candidate[] = [];
  private checked: Map<string, Checked> = new Map();
  private leaderboard: Checked[] = [];
  private lastUpdated = 0;
  private seenCount = 0; // root posts observed since this instance last (re)started
  private sampleCounter = 0;
  private ws: any = null;
  private reconnectDelay = 1000;

  constructor(state: DurableObjectState) {
    this.state = state;
    this.ready = this.state.blockConcurrencyWhile(async () => {
      const [leaderboard, lastUpdated] = await Promise.all([
        this.state.storage.get<Checked[]>("leaderboard"),
        this.state.storage.get<number>("lastUpdated"),
      ]);
      this.leaderboard = leaderboard ?? [];
      this.lastUpdated = lastUpdated ?? 0;
    });
    this.connectSocket().catch(() => {});
    this.state.storage.setAlarm(Date.now() + ALARM_MS).catch(() => {});
  }

  // ---- firehose ------------------------------------------------------------
  // Workers connect OUT to a WebSocket server via fetch() + an Upgrade header
  // (the documented Cloudflare pattern — see developers.cloudflare.com/workers/
  // examples/websockets/), not the browser-style `new WebSocket(url)`
  // constructor the client-side sites (sites/trigrams/public/firehose) use.
  private async connectSocket(): Promise<void> {
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
    const delay = this.reconnectDelay;
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30000);
    setTimeout(() => {
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
    if (!text) return;
    if (rec.reply) return; // root posts only — a clean "post", not a reply in a chain
    if (looksLikeSpam(text)) return;

    this.seenCount++;
    this.sampleCounter++;
    // Sub-sample the firehose so the check rate stays well under what a single
    // Worker invocation can batch through getPosts every tick.
    if (this.sampleCounter % SAMPLE_KEEP_1_OF !== 0) return;
    if (this.checkQueue.length >= MAX_QUEUE) return; // backlog full — drop, don't grow unbounded

    const now = Date.now();
    const uri = `at://${evt.did}/app.bsky.feed.post/${commit.rkey}`;
    if (this.checked.has(uri)) return;
    this.checkQueue.push({
      uri,
      did: evt.did,
      rkey: commit.rkey,
      text: text.length > 240 ? text.slice(0, 240) + "…" : text,
      createdAt: now,
      dueAt: now + CHECK_DELAY_MS,
    });
  }

  // ---- stats -----------------------------------------------------------
  private async fetchStats(uris: string[]): Promise<Map<string, any>> {
    const out = new Map<string, any>();
    const batches: string[][] = [];
    for (let i = 0; i < uris.length; i += 25) batches.push(uris.slice(i, i + 25));
    await Promise.all(
      batches.map(async (batch) => {
        try {
          const url = new URL(`${APPVIEW}/app.bsky.feed.getPosts`);
          for (const u of batch) url.searchParams.append("uris", u);
          const r = await fetch(url.toString());
          if (!r.ok) return;
          const data: any = await r.json();
          for (const p of data.posts || []) out.set(p.uri, p);
        } catch {
          // one bad batch shouldn't sink the tick
        }
      }),
    );
    return out;
  }

  private toChecked(base: Candidate | Checked, post: any): Checked {
    const author = post.author || {};
    const likeCount = post.likeCount || 0;
    const replyCount = post.replyCount || 0;
    const repostCount = post.repostCount || 0;
    const baseText = "text" in base ? base.text : "";
    return {
      uri: base.uri,
      did: base.did,
      rkey: base.rkey,
      handle: author.handle || "",
      displayName: author.displayName || author.handle || "",
      avatar: author.avatar || "",
      text: baseText || (post.record && post.record.text) || "",
      createdAt: base.createdAt,
      likeCount,
      replyCount,
      repostCount,
      imgThumb: embedImage(post),
      score: replyCount / (likeCount + 1),
      checkedAt: Date.now(),
    };
  }

  private recomputeLeaderboard(): void {
    const now = Date.now();
    const qualifying = Array.from(this.checked.values()).filter(
      (e) => now - e.createdAt <= WINDOW_MS && e.replyCount >= MIN_REPLIES && e.replyCount > e.likeCount,
    );
    qualifying.sort(
      (a, b) => b.score - a.score || b.replyCount - a.replyCount || a.likeCount - b.likeCount,
    );
    this.leaderboard = qualifying.slice(0, LEADERBOARD_SIZE);
  }

  // ---- alarm: the tracker's heartbeat -----------------------------------
  async alarm(): Promise<void> {
    await this.ready;
    if (!this.wsOpen()) this.connectSocket().catch(() => {});

    const now = Date.now();
    const due: Candidate[] = [];
    while (
      this.checkQueue.length &&
      this.checkQueue[0].dueAt <= now &&
      due.length < MAX_CHECKS_PER_TICK
    ) {
      due.push(this.checkQueue.shift() as Candidate);
    }

    if (due.length) {
      const fresh = await this.fetchStats(due.map((c) => c.uri));
      for (const c of due) {
        const post = fresh.get(c.uri);
        if (!post) continue; // deleted, or not indexed yet — drop rather than guess
        this.checked.set(c.uri, this.toChecked(c, post));
      }
    }

    // Re-check the CURRENT leaderboard's numbers so what's on screen keeps moving.
    const topUris = this.leaderboard.slice(0, REFRESH_TOP_N).map((e) => e.uri);
    if (topUris.length) {
      const fresh = await this.fetchStats(topUris);
      for (const uri of topUris) {
        const post = fresh.get(uri);
        const prev = this.checked.get(uri);
        if (post && prev) this.checked.set(uri, this.toChecked(prev, post));
      }
    }

    // Prune anything that's aged out of the rolling window.
    for (const [uri, entry] of this.checked) {
      if (now - entry.createdAt > WINDOW_MS) this.checked.delete(uri);
    }
    while (this.checkQueue.length && now - this.checkQueue[0].createdAt > WINDOW_MS) {
      this.checkQueue.shift();
    }

    this.recomputeLeaderboard();
    this.lastUpdated = now;
    await this.state.storage.put({ leaderboard: this.leaderboard, lastUpdated: this.lastUpdated });
    await this.state.storage.setAlarm(now + ALARM_MS);
  }

  // ---- http ---------------------------------------------------------------
  async fetch(request: Request): Promise<Response> {
    await this.ready;
    if (!this.wsOpen()) this.connectSocket().catch(() => {});

    const url = new URL(request.url);
    if (url.pathname === "/api/leaderboard") {
      return json({
        updatedAt: this.lastUpdated || null,
        windowMinutes: WINDOW_MS / 60000,
        tracking: this.checked.size,
        leaderboard: this.leaderboard,
      });
    }
    return json({ error: "not found" }, 404);
  }
}
