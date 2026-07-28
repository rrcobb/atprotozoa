// giftlinks Worker — bisks.net/giftlinks
//
// @dulanyw.bsky.social's idea: a daily rolling list of gift-article links
// (NYT/WaPo/WSJ/etc "read this one free" links) shared on atproto, with as
// much card info as we can get, a search bar, and filtering by source.
//
// searchPosts (which would let us just poll domain:nytimes.com) is
// administratively blocked for anonymous callers — see sites/trigrams'
// notes/71 — so this watches the live Jetstream firehose for external-link
// embeds whose URL matches a known gift-link shape (see GIFT_SOURCES below),
// then hydrates each candidate a few minutes later via the public
// unauthenticated AppView (getPosts) to pull the real card (title,
// description, image) and the sharer's profile, and to confirm the post is
// still real. Qualifying links live in a rolling 24h window in one Durable
// Object — same shape as sites/quotehof/sites/ratioed, shorter window.

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

// Mounted at bisks.net/giftlinks/ — strip the mount prefix before routing,
// so the /api/* check and the DO + ASSETS both see root-relative paths.
// Guarded (not an unconditional slice) so a request that somehow arrives
// without the prefix — e.g. hitting a stale workers.dev/custom-domain route
// directly — passes through unchanged instead of getting its path chopped
// short. See notes/20-deploy.md ("the old custom domain can keep resolving").
const PREFIX = "/giftlinks";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === PREFIX || url.pathname.startsWith(PREFIX + "/")) {
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

// ---- gift-link detection ---------------------------------------------------
//
// Best-effort per-outlet rules. Confirmed from real examples for NYT
// (unlocked_article_code) and WSJ (st=); wapo.st is WaPo's own share-link
// shortener domain, used specifically for gift/share links. For outlets
// where the exact param name couldn't be confirmed, fall back to "any query
// param whose key or value mentions 'gift'" — still gated on a recognized
// paywalled-outlet domain, so it stays reasonably precise.
interface GiftSource {
  key: string;
  name: string;
  domains: string[];
  match: (u: URL) => boolean;
}

function hasGiftParam(u: URL): boolean {
  for (const [k, v] of u.searchParams) {
    if (/gift/i.test(k) || /gift/i.test(v)) return true;
  }
  return false;
}

const GIFT_SOURCES: GiftSource[] = [
  { key: "nyt", name: "The New York Times", domains: ["nytimes.com", "nyti.ms"], match: (u) => u.searchParams.has("unlocked_article_code") },
  { key: "wsj", name: "The Wall Street Journal", domains: ["wsj.com"], match: (u) => u.searchParams.has("st") },
  { key: "wapo", name: "The Washington Post", domains: ["wapo.st"], match: () => true },
  { key: "athletic", name: "The Athletic", domains: ["theathletic.com"], match: (u) => u.searchParams.has("unlocked_article_code") || hasGiftParam(u) },
  { key: "atlantic", name: "The Atlantic", domains: ["theatlantic.com"], match: hasGiftParam },
  { key: "bloomberg", name: "Bloomberg", domains: ["bloomberg.com"], match: hasGiftParam },
  { key: "economist", name: "The Economist", domains: ["economist.com"], match: hasGiftParam },
  { key: "ft", name: "Financial Times", domains: ["ft.com"], match: hasGiftParam },
  { key: "newyorker", name: "The New Yorker", domains: ["newyorker.com"], match: hasGiftParam },
  { key: "latimes", name: "Los Angeles Times", domains: ["latimes.com"], match: hasGiftParam },
  { key: "businessinsider", name: "Business Insider", domains: ["businessinsider.com"], match: hasGiftParam },
];

function hostMatches(hostname: string, domain: string): boolean {
  return hostname === domain || hostname.endsWith("." + domain);
}

export function detectGiftSource(rawUrl: string): GiftSource | null {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return null;
  }
  for (const src of GIFT_SOURCES) {
    if (src.domains.some((d) => hostMatches(u.hostname, d)) && src.match(u)) return src;
  }
  return null;
}

// ---- config ----------------------------------------------------------------
const JETSTREAM_URL =
  "https://jetstream2.us-east.bsky.network/subscribe?wantedCollections=app.bsky.feed.post";
const APPVIEW = "https://public.api.bsky.app/xrpc";

const WINDOW_MS = 24 * 60 * 60 * 1000; // rolling window: "refreshed every 24 hours"
const CHECK_DELAY_MS = 3 * 60 * 1000; // give the AppView a few min to index the new post
const ALARM_MS = 30 * 1000; // tick cadence — also the reconnect heartbeat
const MAX_QUEUE = 4000; // safety valve: drop new candidates if the check backlog balloons
const MAX_CHECKS_PER_TICK = 200; // 8 getPosts batches of 25 — cheap, well under subrequest limits
const MAX_ARTICLES = 2000; // safety valve on stored article count

interface Candidate {
  uri: string;
  did: string;
  rkey: string;
  createdAt: number;
  dueAt: number;
}

interface Article {
  uri: string;
  rkey: string;
  handle: string;
  displayName: string;
  avatar: string;
  articleUrl: string;
  hostname: string;
  title: string;
  description: string;
  thumb: string | null;
  sourceKey: string;
  sourceName: string;
  sharedAt: number; // post's own createdAt
  checkedAt: number;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// The hydrated AppView view's external embed — direct or wrapped in
// recordWithMedia (a link card alongside a quote-post, still counts).
function externalEmbed(post: any): { uri: string; title: string; description: string; thumb: string | null } | null {
  const e = post && post.embed;
  if (!e) return null;
  const ext =
    e.$type === "app.bsky.embed.external#view"
      ? e.external
      : e.$type === "app.bsky.embed.recordWithMedia#view" && e.media && e.media.$type === "app.bsky.embed.external#view"
        ? e.media.external
        : null;
  if (!ext || !ext.uri) return null;
  return { uri: ext.uri, title: ext.title || "", description: ext.description || "", thumb: ext.thumb || null };
}

export class GiftTracker {
  private state: DurableObjectState;
  private ready: Promise<void>;
  private checkQueue: Candidate[] = [];
  private seenUris: Set<string> = new Set(); // dedupe: don't re-queue a uri already tracked or checked
  private articles: Map<string, Article> = new Map();
  private lastUpdated = 0;
  private ws: any = null;
  private reconnectDelay = 1000;

  constructor(state: DurableObjectState) {
    this.state = state;
    this.ready = this.state.blockConcurrencyWhile(async () => {
      const [articles, lastUpdated] = await Promise.all([
        this.state.storage.get<Article[]>("articles"),
        this.state.storage.get<number>("lastUpdated"),
      ]);
      for (const a of articles ?? []) {
        this.articles.set(a.uri, a);
        this.seenUris.add(a.uri);
      }
      this.lastUpdated = lastUpdated ?? 0;
    });
    this.connectSocket().catch(() => {});
    this.state.storage.setAlarm(Date.now() + ALARM_MS).catch(() => {});
  }

  // ---- firehose ----------------------------------------------------------
  // Workers connect OUT to a WebSocket server via fetch() + an Upgrade
  // header (the documented Cloudflare pattern), not `new WebSocket(url)`.
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

  // Cheap firehose-time filter: a post whose external link embed's URL
  // matches a known gift-link shape. Re-verified against the hydrated
  // AppView view before anything makes the list.
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

    const embed = rec.embed;
    if (!embed) return;
    const ext =
      embed.$type === "app.bsky.embed.external"
        ? embed.external
        : embed.$type === "app.bsky.embed.recordWithMedia" && embed.media && embed.media.$type === "app.bsky.embed.external"
          ? embed.media.external
          : null;
    const linkUrl: string | undefined = ext && ext.uri;
    if (!linkUrl || !detectGiftSource(linkUrl)) return;

    if (this.checkQueue.length >= MAX_QUEUE) return; // backlog full — drop, don't grow unbounded

    const uri = `at://${evt.did}/app.bsky.feed.post/${commit.rkey}`;
    if (this.seenUris.has(uri)) return;
    this.seenUris.add(uri);
    const now = Date.now();
    this.checkQueue.push({ uri, did: evt.did, rkey: commit.rkey, createdAt: now, dueAt: now + CHECK_DELAY_MS });
  }

  // ---- AppView -------------------------------------------------------------
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

  private verify(cand: Candidate, post: any): Article | null {
    if (!post) return null;
    const ext = externalEmbed(post);
    if (!ext) return null;
    const src = detectGiftSource(ext.uri);
    if (!src) return null;
    let hostname = "";
    try {
      hostname = new URL(ext.uri).hostname;
    } catch {
      return null;
    }
    const author = post.author || {};
    const rec = post.record || {};
    return {
      uri: cand.uri,
      rkey: cand.rkey,
      handle: author.handle || "",
      displayName: author.displayName || author.handle || "",
      avatar: author.avatar || "",
      articleUrl: ext.uri,
      hostname,
      title: ext.title,
      description: ext.description,
      thumb: ext.thumb,
      sourceKey: src.key,
      sourceName: src.name,
      sharedAt: rec.createdAt ? Date.parse(rec.createdAt) || cand.createdAt : cand.createdAt,
      checkedAt: Date.now(),
    };
  }

  // ---- alarm: the tracker's heartbeat -------------------------------------
  async alarm(): Promise<void> {
    await this.ready;
    if (!this.wsOpen()) this.connectSocket().catch(() => {});

    const now = Date.now();

    const due: Candidate[] = [];
    while (this.checkQueue.length && this.checkQueue[0].dueAt <= now && due.length < MAX_CHECKS_PER_TICK) {
      due.push(this.checkQueue.shift() as Candidate);
    }
    if (due.length) {
      const fresh = await this.fetchPosts(due.map((c) => c.uri));
      for (const c of due) {
        const a = this.verify(c, fresh.get(c.uri));
        if (a) this.articles.set(a.uri, a);
      }
    }

    // Prune anything that's aged out of the rolling window.
    for (const [uri, a] of this.articles) {
      if (now - a.sharedAt > WINDOW_MS) {
        this.articles.delete(uri);
        this.seenUris.delete(uri);
      }
    }
    while (this.checkQueue.length && now - this.checkQueue[0].createdAt > WINDOW_MS) {
      this.seenUris.delete(this.checkQueue[0].uri);
      this.checkQueue.shift();
    }
    // Safety valve: if somehow still over the cap, drop the oldest.
    if (this.articles.size > MAX_ARTICLES) {
      const sorted = Array.from(this.articles.values()).sort((a, b) => a.sharedAt - b.sharedAt);
      for (const a of sorted.slice(0, this.articles.size - MAX_ARTICLES)) this.articles.delete(a.uri);
    }

    this.lastUpdated = now;
    await this.state.storage.put({
      articles: Array.from(this.articles.values()),
      lastUpdated: this.lastUpdated,
    });
    await this.state.storage.setAlarm(now + ALARM_MS);
  }

  // ---- http ----------------------------------------------------------------
  async fetch(request: Request): Promise<Response> {
    await this.ready;
    if (!this.wsOpen()) this.connectSocket().catch(() => {});

    const url = new URL(request.url);
    if (url.pathname === "/api/articles") {
      const list = Array.from(this.articles.values()).sort((a, b) => b.sharedAt - a.sharedAt);
      return json({
        updatedAt: this.lastUpdated || null,
        windowHours: WINDOW_MS / (60 * 60 * 1000),
        count: list.length,
        sources: GIFT_SOURCES.map((s) => ({ key: s.key, name: s.name })),
        articles: list,
      });
    }
    return json({ error: "not found" }, 404);
  }
}
