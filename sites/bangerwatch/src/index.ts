// bangerwatch Worker — bangerwatch.bisks.net
//
// @cee.wtf asked (riffing on @catblanketflower.yuwakisa.com's "a banger is
// like 10 likes") for a site that follows a handle's mutuals — people they
// follow who follow them back — and shows their posts live as the likes
// climb toward 10. The instant one crosses the line: full-screen confetti,
// an over-the-top synthesized fanfare, and the post stops being tracked.
//
// One Durable Object per tracked handle (keyed by the normalized handle
// string) holds everything: the mutuals computation, the live firehose watch,
// and the rolling "climbing" / "hall of fame" state. Same shape as
// sites/ratioed — a Jetstream websocket feeding an alarm-driven heartbeat
// that refreshes stats via the public, unauthenticated AppView
// (getProfile/getFollows/getFollowers/getPosts, no login needed).
//
// Mutuals computation is gated behind the alarm loop rather than run inline
// in the fetch handler, same reasoning as sites/the-place: it can take a
// handful of paginated requests and shouldn't block a response.

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
  TRACKER: DurableObjectNamespace;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "access-control-allow-origin": "*" },
  });
}

// Accepts "@handle.bsky.social", a bare handle, a did:plc:..., or a pasted
// "https://bsky.app/profile/<handle>" link.
function normalizeHandle(raw: string): string {
  let s = (raw || "").trim();
  s = s.replace(/^https?:\/\/(bsky\.app|staging\.bsky\.app)\/profile\//i, "");
  s = s.replace(/\/.*$/, ""); // drop any trailing path (e.g. /post/...)
  s = s.replace(/^@/, "");
  if (s.toLowerCase().startsWith("did:")) return s; // DIDs are case-sensitive-ish, leave alone
  return s.toLowerCase();
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api/state") {
      const handle = normalizeHandle(url.searchParams.get("handle") || "");
      if (!handle) return json({ error: "handle required" }, 400);
      const id = env.TRACKER.idFromName(handle);
      const stub = env.TRACKER.get(id);
      return stub.fetch(request);
    }
    return env.ASSETS.fetch(request);
  },
};

// ---- config ----------------------------------------------------------------
const JETSTREAM_URL =
  "https://jetstream2.us-east.bsky.network/subscribe?wantedCollections=app.bsky.feed.post";
const APPVIEW = "https://public.api.bsky.app/xrpc";

const ALARM_MS = 20 * 1000; // heartbeat / reconnect cadence
const DEMAND_LEASE_MS = 30 * 1000; // stop background work after the last visible poll
const BANGER_LIKES = 10; // the line — at this count a post stops climbing and starts celebrating
const MUTUALS_MAX_PAGES = 15; // caps follows/followers fetches at ~1500 each — plenty for a personal account
const MUTUALS_REFRESH_MS = 6 * 60 * 60 * 1000; // recompute the mutuals list every 6h so it doesn't go stale
const MUTUALS_RETRY_MS = 5 * 60 * 1000; // after an error (bad handle, AppView hiccup), don't hammer — retry every 5m
const CLIMBING_EXPIRE_MS = 4 * 24 * 60 * 60 * 1000; // give a post 4 days to reach 10 before quietly giving up on it
const NOT_YET_INDEXED_GRACE_MS = 90 * 1000; // a post this fresh might not be in getPosts yet — don't drop it as deleted
const MAX_CLIMBING = 250; // safety valve for a very high-volume mutuals set
const CELEBRATIONS_KEEP = 80; // hall-of-fame size kept in storage/response
const PRELOAD_SAMPLE_MUTUALS = 40; // cap on getAuthorFeed calls made once, right after mutuals first resolve
const PRELOAD_MAX_ADD = 15; // don't flood a fresh dashboard — a handful of already-climbing posts is enough

interface PersonInfo {
  did: string;
  handle: string;
  displayName: string;
  avatar: string;
}

interface ClimbingPost {
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
  isReply: boolean;
}

interface Celebration extends ClimbingPost {
  hitAt: number;
}

async function bskyGet(path: string, params: Record<string, string>): Promise<any> {
  const url = new URL(`${APPVIEW}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString(), { headers: { accept: "application/json" } });
  if (!res.ok) return null;
  return res.json();
}

// Same shape as sites/ratioed's embedImage() — the firehose only carries raw
// blob refs, but getPosts returns the fully-resolved CDN thumb.
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

export class MutualTracker {
  private state: DurableObjectState;
  private ready: Promise<void>;

  private targetHandleInput = "";
  private targetProfile: PersonInfo | null = null;
  private mutualsStatus: "none" | "pending" | "ready" | "error" = "none";
  private mutualsError: string | null = null;
  private mutualsErrorAt = 0;
  private mutuals: Map<string, PersonInfo> = new Map();
  private mutualsUpdatedAt = 0;

  private climbing: ClimbingPost[] = [];
  private celebrations: Celebration[] = [];
  private lastTick = 0;
  private preloaded = false; // have we already seeded `climbing` from mutuals' recent posts?

  private ws: any = null;
  private reconnectDelay = 1000;
  private lastDemandAt = 0;

  constructor(state: DurableObjectState) {
    this.state = state;
    this.ready = this.state.blockConcurrencyWhile(async () => {
      const [
        targetHandleInput,
        targetProfile,
        mutualsStatus,
        mutualsError,
        mutualsErrorAt,
        mutualsList,
        mutualsUpdatedAt,
        climbing,
        celebrations,
        lastTick,
        preloaded,
      ] = await Promise.all([
        this.state.storage.get<string>("targetHandleInput"),
        this.state.storage.get<PersonInfo>("targetProfile"),
        this.state.storage.get<string>("mutualsStatus"),
        this.state.storage.get<string>("mutualsError"),
        this.state.storage.get<number>("mutualsErrorAt"),
        this.state.storage.get<PersonInfo[]>("mutuals"),
        this.state.storage.get<number>("mutualsUpdatedAt"),
        this.state.storage.get<ClimbingPost[]>("climbing"),
        this.state.storage.get<Celebration[]>("celebrations"),
        this.state.storage.get<number>("lastTick"),
        this.state.storage.get<boolean>("preloaded"),
      ]);
      this.targetHandleInput = targetHandleInput ?? "";
      this.targetProfile = targetProfile ?? null;
      this.mutualsStatus = (mutualsStatus as any) ?? "none";
      this.mutualsError = mutualsError ?? null;
      this.mutualsErrorAt = mutualsErrorAt ?? 0;
      this.mutuals = new Map((mutualsList ?? []).map((p) => [p.did, p]));
      this.mutualsUpdatedAt = mutualsUpdatedAt ?? 0;
      this.climbing = climbing ?? [];
      this.celebrations = celebrations ?? [];
      this.lastTick = lastTick ?? 0;
      this.preloaded = preloaded ?? false;
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

  private async persist(): Promise<void> {
    await this.state.storage.put({
      targetHandleInput: this.targetHandleInput,
      targetProfile: this.targetProfile,
      mutualsStatus: this.mutualsStatus,
      mutualsError: this.mutualsError,
      mutualsErrorAt: this.mutualsErrorAt,
      mutuals: Array.from(this.mutuals.values()),
      mutualsUpdatedAt: this.mutualsUpdatedAt,
      climbing: this.climbing,
      celebrations: this.celebrations,
      lastTick: this.lastTick,
      preloaded: this.preloaded,
    });
  }

  // ---- firehose --------------------------------------------------------
  // Workers connect OUT to a WebSocket server via fetch() + an Upgrade
  // header (the documented Cloudflare pattern), not `new WebSocket(url)`.
  // Same recipe as sites/ratioed.
  private async connectSocket(): Promise<void> {
    if (!this.hasDemand() || this.mutualsStatus !== "ready" || this.mutuals.size === 0) return;
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
    if (this.mutualsStatus !== "ready" || this.mutuals.size === 0) return;
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
    if (!evt.did || !this.mutuals.has(evt.did)) return;

    const rec = commit.record;
    if (!rec || typeof rec.text !== "string") return;
    const uri = `at://${evt.did}/app.bsky.feed.post/${commit.rkey}`;
    if (this.climbing.some((c) => c.uri === uri) || this.celebrations.some((c) => c.uri === uri)) return;

    const author = this.mutuals.get(evt.did)!;
    const createdAt = Date.parse(rec.createdAt) || Date.now();
    const text = rec.text.trim();

    if (this.climbing.length >= MAX_CLIMBING) this.climbing.shift(); // drop the oldest to make room

    this.climbing.push({
      uri,
      did: evt.did,
      rkey: commit.rkey,
      handle: author.handle,
      displayName: author.displayName,
      avatar: author.avatar,
      text: text.length > 300 ? text.slice(0, 300) + "…" : text,
      createdAt,
      likeCount: 0,
      replyCount: 0,
      repostCount: 0,
      imgThumb: null,
      isReply: !!rec.reply,
    });
  }

  // ---- mutuals -----------------------------------------------------------
  private async fetchConnections(
    actor: string,
    kind: "app.bsky.graph.getFollows" | "app.bsky.graph.getFollowers",
  ): Promise<Map<string, PersonInfo>> {
    const out = new Map<string, PersonInfo>();
    let cursor: string | undefined;
    for (let page = 0; page < MUTUALS_MAX_PAGES; page++) {
      const data = await bskyGet(kind, {
        actor,
        limit: "100",
        ...(cursor ? { cursor } : {}),
      });
      if (!data) break;
      const list: any[] = data.follows || data.followers || [];
      if (!list.length) break;
      for (const p of list) {
        out.set(p.did, {
          did: p.did,
          handle: p.handle,
          displayName: p.displayName || p.handle,
          avatar: p.avatar || "",
        });
      }
      cursor = data.cursor;
      if (!cursor) break;
    }
    return out;
  }

  private async computeMutuals(): Promise<void> {
    this.mutualsStatus = "pending";
    try {
      const profile = await bskyGet("app.bsky.actor.getProfile", { actor: this.targetHandleInput });
      if (!profile || !profile.did) throw new Error("that handle doesn't resolve to an account");
      this.targetProfile = {
        did: profile.did,
        handle: profile.handle,
        displayName: profile.displayName || profile.handle,
        avatar: profile.avatar || "",
      };
      const [follows, followers] = await Promise.all([
        this.fetchConnections(profile.did, "app.bsky.graph.getFollows"),
        this.fetchConnections(profile.did, "app.bsky.graph.getFollowers"),
      ]);
      const mutuals = new Map<string, PersonInfo>();
      for (const [did, info] of follows) {
        if (did !== profile.did && followers.has(did)) mutuals.set(did, info);
      }
      this.mutuals = mutuals;
      this.mutualsStatus = "ready";
      this.mutualsUpdatedAt = Date.now();
      this.mutualsError = null;
    } catch (e: any) {
      this.mutualsStatus = "error";
      this.mutualsError = String((e && e.message) || e);
      this.mutualsErrorAt = Date.now();
    }
  }

  // One-shot, right after mutuals first resolve: sample a chunk of the
  // mutuals list and pull their recent posts via getAuthorFeed, seeding
  // `climbing` with whatever's already sub-10-likes so the dashboard opens
  // with something on it instead of a blank wall waiting for the firehose.
  private async preloadClimbing(): Promise<void> {
    if (this.mutuals.size === 0) return;
    const pool = Array.from(this.mutuals.values());
    const sampleSize = Math.min(pool.length, PRELOAD_SAMPLE_MUTUALS);
    const sample: PersonInfo[] = [];
    const usedIdx = new Set<number>();
    while (sample.length < sampleSize) {
      const i = Math.floor(Math.random() * pool.length);
      if (usedIdx.has(i)) continue;
      usedIdx.add(i);
      sample.push(pool[i]);
    }

    const now = Date.now();
    const found: ClimbingPost[] = [];
    await Promise.all(
      sample.map(async (person) => {
        try {
          const data = await bskyGet("app.bsky.feed.getAuthorFeed", { actor: person.did, limit: "5" });
          if (!data || !Array.isArray(data.feed)) return;
          for (const item of data.feed) {
            const post = item && item.post;
            if (!post || !post.uri || !post.author || post.author.did !== person.did) continue; // skip reposts
            const likeCount = post.likeCount || 0;
            if (likeCount >= BANGER_LIKES) continue;
            const createdAt = Date.parse((post.record && post.record.createdAt) || "") || 0;
            if (!createdAt || now - createdAt > CLIMBING_EXPIRE_MS) continue;
            const rkey = post.uri.split("/").pop() || "";
            const text = ((post.record && post.record.text) || "").trim();
            found.push({
              uri: post.uri,
              did: person.did,
              rkey,
              handle: person.handle,
              displayName: person.displayName,
              avatar: person.avatar,
              text: text.length > 300 ? text.slice(0, 300) + "…" : text,
              createdAt,
              likeCount,
              replyCount: post.replyCount || 0,
              repostCount: post.repostCount || 0,
              imgThumb: embedImage(post),
              isReply: !!(post.record && post.record.reply),
            });
          }
        } catch {
          // one mutual's feed failing shouldn't block the rest
        }
      }),
    );

    found.sort((a, b) => b.createdAt - a.createdAt);
    const existing = new Set(this.climbing.map((c) => c.uri));
    let added = 0;
    for (const c of found) {
      if (added >= PRELOAD_MAX_ADD || this.climbing.length >= MAX_CLIMBING) break;
      if (existing.has(c.uri)) continue;
      this.climbing.push(c);
      existing.add(c.uri);
      added++;
    }
  }

  // ---- stats -------------------------------------------------------------
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

  private applyPost(base: ClimbingPost, post: any): ClimbingPost {
    const author = post.author || {};
    return {
      ...base,
      handle: author.handle || base.handle,
      displayName: author.displayName || author.handle || base.displayName,
      avatar: author.avatar || base.avatar,
      text: (post.record && post.record.text) || base.text,
      likeCount: post.likeCount || 0,
      replyCount: post.replyCount || 0,
      repostCount: post.repostCount || 0,
      imgThumb: embedImage(post),
    };
  }

  private celebrate(entry: ClimbingPost): void {
    this.celebrations.push({ ...entry, hitAt: Date.now() });
    if (this.celebrations.length > CELEBRATIONS_KEEP) {
      this.celebrations.splice(0, this.celebrations.length - CELEBRATIONS_KEEP);
    }
  }

  // ---- alarm: the tracker's heartbeat -------------------------------------
  async alarm(): Promise<void> {
    await this.ready;
    if (!this.hasDemand()) {
      this.closeSocket();
      await this.state.storage.deleteAlarm();
      return;
    }
    const now = Date.now();

    if (this.targetHandleInput) {
      const needsInitial = this.mutualsStatus === "none" || this.mutualsStatus === "pending";
      const needsRefresh = this.mutualsStatus === "ready" && now - this.mutualsUpdatedAt > MUTUALS_REFRESH_MS;
      const needsRetry = this.mutualsStatus === "error" && now - this.mutualsErrorAt > MUTUALS_RETRY_MS;
      if (needsInitial || needsRefresh || needsRetry) {
        await this.computeMutuals();
        if (this.mutualsStatus === "ready" && !this.preloaded) {
          await this.preloadClimbing();
          this.preloaded = true;
        }
      }
    }

    if (this.mutualsStatus === "ready" && this.mutuals.size > 0 && !this.wsOpen()) {
      this.connectSocket().catch(() => {});
    }

    if (this.climbing.length) {
      const fresh = await this.fetchStats(this.climbing.map((c) => c.uri));
      const stillClimbing: ClimbingPost[] = [];
      for (const c of this.climbing) {
        const post = fresh.get(c.uri);
        if (!post) {
          // Not in the response: either deleted, or (if very fresh) just not
          // indexed by the AppView yet. Give the latter a grace window
          // instead of dropping it as deleted.
          if (now - c.createdAt < NOT_YET_INDEXED_GRACE_MS) stillClimbing.push(c);
          continue;
        }
        const updated = this.applyPost(c, post);
        if (updated.likeCount >= BANGER_LIKES) {
          this.celebrate(updated); // crossed the line — freeze it here and stop tracking
        } else if (now - updated.createdAt > CLIMBING_EXPIRE_MS) {
          // didn't make it in time — quietly give up
        } else {
          stillClimbing.push(updated);
        }
      }
      this.climbing = stillClimbing;
    }

    this.lastTick = now;
    await this.persist();
    if (this.hasDemand()) {
      await this.armAlarm();
    } else {
      this.closeSocket();
      await this.state.storage.deleteAlarm();
    }
  }

  // ---- http ---------------------------------------------------------------
  async fetch(request: Request): Promise<Response> {
    await this.ready;

    const url = new URL(request.url);
    if (url.pathname !== "/api/state") return json({ error: "not found" }, 404);

    this.lastDemandAt = Date.now();

    const handleParam = (url.searchParams.get("handle") || "").trim();
    if (!this.targetHandleInput && handleParam) {
      this.targetHandleInput = handleParam;
      this.mutualsStatus = "pending";
      await this.persist();
      await this.armAlarm(200); // kick off the mutuals fetch almost immediately
    } else {
      await this.armAlarm();
    }

    if (this.mutualsStatus === "ready" && this.mutuals.size > 0 && !this.wsOpen()) {
      this.connectSocket().catch(() => {});
    }

    const climbing = this.climbing
      .slice()
      .sort((a, b) => b.likeCount - a.likeCount || b.createdAt - a.createdAt);
    const celebrations = this.celebrations.slice().reverse(); // newest first

    return json({
      handle: this.targetHandleInput,
      targetProfile: this.targetProfile,
      mutualsStatus: this.mutualsStatus,
      mutualsError: this.mutualsError,
      mutualsCount: this.mutuals.size,
      mutualsUpdatedAt: this.mutualsUpdatedAt || null,
      bangerLikes: BANGER_LIKES,
      climbing,
      celebrations,
      updatedAt: this.lastTick || null,
    });
  }
}
