// quotehof Worker — bisks.net/quotehof
//
// @psingletary.com's idea, tagged in by @antiali.as: "a page of the quote
// poster's hall of fame — the Quote Post can only have an image, and the
// post quoted can only have text. Top 10 reposted in last 14 days, Top 10
// liked in last 14 days. no wammies."
//
// So: a Quote Post whose OWN content is just an image (no caption text),
// quoting a post whose content is just text (no image/video/link-card/
// quote of its own). Rank the qualifying quote posts by their own repost
// and like counts, two boards, 14-day rolling window.
//
// There's no "give me all recent posts" endpoint on the AppView —
// searchPosts is administratively blocked for anonymous callers (see
// sites/trigrams' notes/71). So, same shape as sites/ratioed: watch the
// live firehose (Jetstream) for candidate quote posts (narrow shape means
// low volume — this doesn't need ratioed's sub-sampling), confirm both
// halves of the shape via the public UNAUTHENTICATED AppView (getPosts —
// confirmed to work with no login), and keep a rolling ~14 day leaderboard.
// "no wammies": both the quoting post's shape (image, no text) and the
// quoted post's shape (text, no embed) are re-verified from the hydrated
// AppView view at check time, not just trusted from the raw firehose record.
//
// All of it lives in ONE Durable Object (name "global") — the check queue +
// the live leaderboard are exactly the single-writer rolling state
// notes/10-architecture.md calls out Durable Objects for.

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

// Mounted at bisks.net/quotehof/ — strip the mount prefix before routing, so
// the /api/* check and the DO + ASSETS all see root-relative paths. See
// notes/40-new-site-playbook.md.
const PREFIX = "/quotehof";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    url.pathname = url.pathname.slice(PREFIX.length) || "/";
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
const JETSTREAM_URL =
  "https://jetstream2.us-east.bsky.network/subscribe?wantedCollections=app.bsky.feed.post";
const APPVIEW = "https://public.api.bsky.app/xrpc";

const WINDOW_MS = 14 * 24 * 60 * 60 * 1000; // the rolling window both boards cover
const CHECK_DELAY_MS = 4 * 60 * 1000; // give the AppView a few min to index the new post
const ALARM_MS = 30 * 1000; // tick cadence — also the reconnect heartbeat
const MAX_QUEUE = 4000; // safety valve: drop new candidates if the check backlog balloons
const MAX_CHECKS_PER_TICK = 200; // 8 getPosts batches of 25 — cheap, well under subrequest limits
const MAX_REFRESH_PER_TICK = 200; // how many already-qualifying entries get fresh counts each tick
const BOARD_SIZE = 10;

interface Candidate {
  uri: string;
  did: string;
  rkey: string;
  quotedUri: string;
  createdAt: number;
  dueAt: number;
}

interface Qualified {
  uri: string;
  did: string;
  rkey: string;
  handle: string;
  displayName: string;
  avatar: string;
  imgThumb: string | null;
  createdAt: number;
  likeCount: number;
  repostCount: number;
  quotedUri: string;
  quotedDid: string;
  quotedRkey: string;
  quotedHandle: string;
  quotedDisplayName: string;
  quotedAvatar: string;
  quotedText: string;
  checkedAt: number;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function parseAtUri(uri: string): { did: string; rkey: string } | null {
  const m = /^at:\/\/(did:[^/]+)\/[^/]+\/([^/]+)$/.exec(uri);
  if (!m) return null;
  return { did: m[1], rkey: m[2] };
}

// The hydrated AppView view of the quoting post's embed, when it's a
// recordWithMedia#view wrapping an images#view — the shape we require.
function quoteImageThumb(post: any): string | null {
  const e = post && post.embed;
  if (!e) return null;
  const t = e.$type || "";
  if (t.includes("recordWithMedia#view") && e.media && e.media.$type === "app.bsky.embed.images#view") {
    const imgs = e.media.images;
    if (imgs && imgs[0]) return imgs[0].thumb || null;
  }
  return null;
}

export class QuoteTracker {
  private state: DurableObjectState;
  private ready: Promise<void>;
  private checkQueue: Candidate[] = [];
  private qualified: Map<string, Qualified> = new Map();
  private byRepost: Qualified[] = [];
  private byLike: Qualified[] = [];
  private lastUpdated = 0;
  private seenCount = 0; // candidate quote-with-image posts observed since this instance last (re)started
  private ws: any = null;
  private reconnectDelay = 1000;

  constructor(state: DurableObjectState) {
    this.state = state;
    this.ready = this.state.blockConcurrencyWhile(async () => {
      const [qualified, lastUpdated] = await Promise.all([
        this.state.storage.get<Qualified[]>("qualified"),
        this.state.storage.get<number>("lastUpdated"),
      ]);
      for (const q of qualified ?? []) this.qualified.set(q.uri, q);
      this.lastUpdated = lastUpdated ?? 0;
      this.recomputeBoards();
    });
    this.connectSocket().catch(() => {});
    this.state.storage.setAlarm(Date.now() + ALARM_MS).catch(() => {});
  }

  // ---- firehose --------------------------------------------------------
  // Workers connect OUT to a WebSocket server via fetch() + an Upgrade
  // header (the documented Cloudflare pattern), not the browser-style
  // `new WebSocket(url)` constructor.
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

  // Cheap firehose-time filter: a quote-with-image post whose own text is
  // empty. This is the narrow candidate shape — both halves get re-verified
  // against the hydrated AppView before anything counts as "qualified".
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
    if (!rec) return;
    const text = typeof rec.text === "string" ? rec.text.trim() : "";
    if (text) return; // the Quote Post can only have an image — no caption text

    const embed = rec.embed;
    if (!embed || embed.$type !== "app.bsky.embed.recordWithMedia") return;
    const media = embed.media;
    if (!media || media.$type !== "app.bsky.embed.images") return;
    const quotedRef = embed.record && embed.record.record;
    const quotedUri: string = quotedRef && quotedRef.uri;
    if (!quotedUri || !quotedUri.startsWith("at://")) return;

    if (this.checkQueue.length >= MAX_QUEUE) return; // backlog full — drop, don't grow unbounded

    this.seenCount++;
    const now = Date.now();
    const uri = `at://${evt.did}/app.bsky.feed.post/${commit.rkey}`;
    if (this.qualified.has(uri)) return;
    this.checkQueue.push({
      uri,
      did: evt.did,
      rkey: commit.rkey,
      quotedUri,
      createdAt: now,
      dueAt: now + CHECK_DELAY_MS,
    });
  }

  // ---- AppView -----------------------------------------------------------
  private async fetchPosts(uris: string[]): Promise<Map<string, any>> {
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

  // Strict, hydrated-view re-check of both halves of the shape. Returns
  // null if either half fails — "no wammies".
  private verify(cand: Candidate, quotingPost: any, quotedPost: any): Qualified | null {
    if (!quotingPost || !quotedPost) return null;

    const quotingText = ((quotingPost.record && quotingPost.record.text) || "").trim();
    if (quotingText) return null; // quote post must carry no caption text
    const imgThumb = quoteImageThumb(quotingPost);
    if (!imgThumb) return null; // quote post must carry exactly an image

    if (quotedPost.embed) return null; // quoted post must carry no embed of its own
    const quotedText = ((quotedPost.record && quotedPost.record.text) || "").trim();
    if (!quotedText) return null; // quoted post must actually have text

    const quotedParts = parseAtUri(cand.quotedUri);
    if (!quotedParts) return null;
    const qAuthor = quotedPost.author || {};
    const author = quotingPost.author || {};

    return {
      uri: cand.uri,
      did: cand.did,
      rkey: cand.rkey,
      handle: author.handle || "",
      displayName: author.displayName || author.handle || "",
      avatar: author.avatar || "",
      imgThumb,
      createdAt: cand.createdAt,
      likeCount: quotingPost.likeCount || 0,
      repostCount: quotingPost.repostCount || 0,
      quotedUri: cand.quotedUri,
      quotedDid: quotedParts.did,
      quotedRkey: quotedParts.rkey,
      quotedHandle: qAuthor.handle || "",
      quotedDisplayName: qAuthor.displayName || qAuthor.handle || "",
      quotedAvatar: qAuthor.avatar || "",
      quotedText,
      checkedAt: Date.now(),
    };
  }

  private recomputeBoards(): void {
    const now = Date.now();
    const live = Array.from(this.qualified.values()).filter((e) => now - e.createdAt <= WINDOW_MS);
    this.byRepost = [...live]
      .sort((a, b) => b.repostCount - a.repostCount || b.likeCount - a.likeCount)
      .slice(0, BOARD_SIZE);
    this.byLike = [...live]
      .sort((a, b) => b.likeCount - a.likeCount || b.repostCount - a.repostCount)
      .slice(0, BOARD_SIZE);
  }

  // ---- alarm: the tracker's heartbeat ------------------------------------
  async alarm(): Promise<void> {
    await this.ready;
    if (!this.wsOpen()) this.connectSocket().catch(() => {});

    const now = Date.now();

    // 1. Check due candidates: hydrate both the quoting and quoted post,
    // re-verify the shape strictly, and add anything that survives.
    const due: Candidate[] = [];
    while (
      this.checkQueue.length &&
      this.checkQueue[0].dueAt <= now &&
      due.length < MAX_CHECKS_PER_TICK
    ) {
      due.push(this.checkQueue.shift() as Candidate);
    }
    if (due.length) {
      const uris = Array.from(new Set(due.flatMap((c) => [c.uri, c.quotedUri])));
      const fresh = await this.fetchPosts(uris);
      for (const c of due) {
        const q = this.verify(c, fresh.get(c.uri), fresh.get(c.quotedUri));
        if (q) this.qualified.set(q.uri, q);
      }
    }

    // 2. Refresh counts on already-qualifying entries, oldest-checked first,
    // so the boards keep moving as likes/reposts accumulate over 14 days.
    const stale = Array.from(this.qualified.values()).sort((a, b) => a.checkedAt - b.checkedAt);
    const toRefresh = stale.slice(0, MAX_REFRESH_PER_TICK);
    if (toRefresh.length) {
      const fresh = await this.fetchPosts(toRefresh.map((e) => e.uri));
      for (const e of toRefresh) {
        const post = fresh.get(e.uri);
        if (!post) {
          this.qualified.delete(e.uri); // deleted since we last checked
          continue;
        }
        e.likeCount = post.likeCount || 0;
        e.repostCount = post.repostCount || 0;
        e.checkedAt = now;
      }
    }

    // 3. Prune anything that's aged out of the rolling window.
    for (const [uri, entry] of this.qualified) {
      if (now - entry.createdAt > WINDOW_MS) this.qualified.delete(uri);
    }
    while (this.checkQueue.length && now - this.checkQueue[0].createdAt > WINDOW_MS) {
      this.checkQueue.shift();
    }

    this.recomputeBoards();
    this.lastUpdated = now;
    await this.state.storage.put({
      qualified: Array.from(this.qualified.values()),
      lastUpdated: this.lastUpdated,
    });
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
        windowDays: WINDOW_MS / (24 * 60 * 60 * 1000),
        tracking: this.qualified.size,
        byRepost: this.byRepost,
        byLike: this.byLike,
      });
    }
    return json({ error: "not found" }, 404);
  }
}
