// steamtags Worker — mounted at bisks.net/steamtags/ (see
// notes/40-new-site-playbook.md).
//
// The idea (v3): pick a Steam game, see its community tags — sized and
// annotated by vote count, straight off SteamSpy — then rate for yourself
// how much any given tag actually fits the game, 1-10. No auto-generated
// "does it match the description" score; that's the whole point of this
// revision, the fit judgement is the user's, not a text heuristic's. Ratings
// live client-side only (localStorage), so the server's only job is to hand
// back a game's name/art plus its tags + vote counts.
//
// Steam's official appdetails API doesn't expose user tags — those live on
// SteamSpy's public mirror (steamspy.com/api.php), which scrapes them off
// the store page and keeps vote counts per tag. Both APIs are public, no
// key, and — unlike calling them straight from the browser — neither sends
// CORS headers, so this Worker proxies server-side and the client only ever
// talks to its own /api/*.
//
// Four server routes, all after the "/steamtags" mount prefix is stripped:
//   /api/search?q=...   proxy Steam's store-search suggest endpoint
//   /api/tags/<appid>   fetch one game's name/art + its tags & votes, JSON
//   /api/global         the network-wide tag leaderboard (see below), JSON
//   /g/<appid>          the shareable per-game page: same static shell,
//                        server-stamped og:title/description/image/url so
//                        every shared result gets its own unfurl card
//                        instead of Bluesky caching one generic card for
//                        every appid (same fix as sites/didscope, sites/windmill).
// Everything else falls through to ASSETS.
//
// /api/global is backed by a Durable Object (GlobalTracker, name "global").
// Ratings are per-user PDS records (net.bisks.steamtags.rating) — there's no
// AppView endpoint that hands back "every record of this custom collection
// across the network", so the DO keeps a live Jetstream subscription
// filtered to just that collection and maintains a running
// tag -> (game -> aggregate score) index, same shape as sites/quadrants'
// QuadrantHub. Like that DO (and sites/ratioed, sites/quotehof), it only
// tracks activity from whenever it started running — no historical
// backfill — so the board fills in as people rate games (or re-sync an
// existing library) going forward.

export interface DurableObjectId {
  toString(): string;
}
export interface DurableObjectStub {
  fetch(request: Request): Promise<Response>;
}
export interface DurableObjectNamespace {
  idFromName(name: string): DurableObjectId;
  get(id: DurableObjectId): DurableObjectStub;
}
export interface DurableObjectStorage {
  get<T = unknown>(key: string): Promise<T | undefined>;
  put(entries: Record<string, unknown>): Promise<void>;
  setAlarm(time: number | Date): Promise<void>;
}
export interface DurableObjectState {
  storage: DurableObjectStorage;
  blockConcurrencyWhile<T>(fn: () => Promise<T>): Promise<T>;
}

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
  GLOBAL: DurableObjectNamespace;
}

const PREFIX = "/steamtags";

// --- tags ----------------------------------------------------------------

interface TagInfo {
  name: string;
  votes: number;
  share: number;
}

interface GameInfo {
  appid: number;
  name: string;
  headerImage: string;
  shortDescription: string;
  isFree: boolean;
  tags: TagInfo[];
  totalVotes: number;
}

function htmlToText(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchJson(url: string): Promise<any> {
  const res = await fetch(url, { cf: { cacheTtl: 300 } as unknown as Record<string, unknown> });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res.json();
}

async function computeGameInfo(appid: string): Promise<GameInfo> {
  const id = String(parseInt(appid, 10));
  if (!id || id === "NaN") throw new Error("bad appid");

  const [detailsRes, spy] = await Promise.all([
    fetchJson(`https://store.steampowered.com/api/appdetails?appids=${id}&l=english`),
    fetchJson(`https://steamspy.com/api.php?request=appdetails&appid=${id}`).catch(() => null),
  ]);

  const entry = detailsRes[id];
  if (!entry || !entry.success || !entry.data) throw new Error("game not found");
  const data = entry.data;

  const rawTags: Record<string, number> =
    spy && spy.tags && !Array.isArray(spy.tags) ? spy.tags : {};

  const entries = Object.entries(rawTags)
    .filter(([, v]) => typeof v === "number")
    .sort((a, b) => b[1] - a[1])
    .slice(0, 16);
  if (entries.length === 0) throw new Error("no community tags found for this game");

  const totalVotes = entries.reduce((s, [, v]) => s + v, 0);
  const tags: TagInfo[] = entries.map(([name, votes]) => ({
    name,
    votes,
    share: totalVotes ? votes / totalVotes : 1 / entries.length,
  }));

  return {
    appid: parseInt(id, 10),
    name: data.name,
    headerImage: data.header_image || "",
    shortDescription: htmlToText(data.short_description || ""),
    isFree: !!data.is_free,
    tags,
    totalVotes,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*" },
  });
}

async function handleSearch(url: URL): Promise<Response> {
  const q = (url.searchParams.get("q") || "").trim();
  if (!q) return jsonResponse({ results: [] });
  try {
    const data = await fetchJson(
      `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(q)}&cc=us&l=english`
    );
    const results = (data.items || [])
      .filter((it: any) => it.type === "app")
      .slice(0, 8)
      .map((it: any) => ({ appid: it.id, name: it.name, image: it.tiny_image }));
    return jsonResponse({ results });
  } catch (_) {
    return jsonResponse({ results: [] });
  }
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const GENERIC_TITLE = "steamtags — rate how well each tag actually fits";
const GENERIC_DESC =
  "Pick any Steam game, see its community tags sized by vote count, and rate for yourself how much each one actually fits — 1 to 10, your call, not an algorithm's.";
const GENERIC_OG_URL = "https://bisks.net/steamtags/";
const GENERIC_OG_IMAGE = "https://bisks.net/steamtags/og.png";

async function renderShare(env: Env, request: Request, appid: string): Promise<Response> {
  const base = await env.ASSETS.fetch(new Request(new URL("/", request.url), { method: "GET" }));
  let html = await base.text();

  try {
    const g = await computeGameInfo(appid);
    const topTags = g.tags.slice(0, 3).map((t) => t.name);
    const title = `${g.name} on steamtags`;
    const desc = topTags.length
      ? `${g.name}'s top community tags: ${topTags.join(", ")}. Rate how well each one actually fits, 1-10.`
      : `Rate how well ${g.name}'s community tags actually fit, 1-10.`;
    const ogUrl = `https://bisks.net/steamtags/g/${g.appid}`;
    const ogImage = g.headerImage || GENERIC_OG_IMAGE;

    // GENERIC_OG_IMAGE must be replaced before GENERIC_OG_URL — the image
    // string starts with the URL string ("https://bisks.net/steamtags/" is a
    // prefix of ".../og.png"), so replacing the shorter one first would eat
    // the front of the image string too and leave "og.png" dangling.
    html = html
      .split(GENERIC_TITLE).join(esc(title))
      .split(GENERIC_DESC).join(esc(desc.slice(0, 300)))
      .split(GENERIC_OG_IMAGE).join(ogImage)
      .split(GENERIC_OG_URL).join(ogUrl);

    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" },
    });
  } catch (_) {
    // Couldn't resolve the appid server-side (bad id, delisted game, Steam
    // hiccup) — still serve the live page so the link isn't dead; the
    // client script surfaces its own "couldn't find that game" error.
    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" },
    });
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === PREFIX) {
      url.pathname = PREFIX + "/";
      return Response.redirect(url.toString(), 308);
    }

    const path = url.pathname.startsWith(PREFIX + "/") ? url.pathname.slice(PREFIX.length) : url.pathname;

    if (path === "/api/search") return handleSearch(url);

    if (path === "/api/global") {
      const doUrl = new URL(request.url);
      doUrl.pathname = path;
      const stub = env.GLOBAL.get(env.GLOBAL.idFromName("global"));
      return stub.fetch(new Request(doUrl.toString(), request));
    }

    const tagsMatch = path.match(/^\/api\/tags\/(\d+)\/?$/);
    if (tagsMatch) {
      try {
        const g = await computeGameInfo(tagsMatch[1]);
        return jsonResponse(g);
      } catch (err: any) {
        return jsonResponse({ error: err?.message || "lookup failed" }, 404);
      }
    }

    const shareMatch = path.match(/^\/g\/(\d+)\/?$/);
    if (shareMatch) return renderShare(env, request, shareMatch[1]);

    const assetUrl = new URL(request.url);
    assetUrl.pathname = path;
    return env.ASSETS.fetch(new Request(assetUrl, request));
  },
};

// ---------------------------------------------------------------------------
// GlobalTracker — one Durable Object (name "global") holding a live index of
// every net.bisks.steamtags.rating record seen on the firehose, keyed by
// did+appid so a re-rate/re-sync just replaces the prior entry. /api/global
// aggregates that index into a tag -> game leaderboard on read.
// ---------------------------------------------------------------------------

const GLOBAL_COLLECTION = "net.bisks.steamtags.rating";
const JETSTREAM_URL = `https://jetstream2.us-east.bsky.network/subscribe?wantedCollections=${GLOBAL_COLLECTION}`;
const RECONNECT_ALARM_MS = 20 * 1000;
const MAX_TAG_NAME = 60;
const MAX_TAGS_PER_ENTRY = 32;
const MAX_ENTRIES = 20000; // safety valve against a runaway/abusive writer
const MAX_TAGS_SHOWN = 40;
const MAX_GAMES_PER_TAG = 8;

interface GlobalTagRating {
  tag: string;
  score: number;
  votes: number;
}

interface GlobalRatingEntry {
  did: string;
  appid: number;
  name: string;
  headerImage: string;
  tags: GlobalTagRating[];
  updatedAt: number;
}

interface GlobalGameBoard {
  appid: number;
  name: string;
  headerImage: string;
  avgScore: number;
  raterCount: number;
}

interface GlobalTagBoard {
  tag: string;
  avgScore: number;
  ratingCount: number;
  userCount: number;
  games: GlobalGameBoard[];
}

function globalJson(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*" },
  });
}

export class GlobalTracker {
  private state: DurableObjectState;
  private ready: Promise<void>;
  private entries: Map<string, GlobalRatingEntry> = new Map();
  private lastUpdated = 0;
  private ws: any = null;
  private reconnectDelay = 1000;

  constructor(state: DurableObjectState) {
    this.state = state;
    this.ready = this.state.blockConcurrencyWhile(async () => {
      const [entries, lastUpdated] = await Promise.all([
        this.state.storage.get<GlobalRatingEntry[]>("entries"),
        this.state.storage.get<number>("lastUpdated"),
      ]);
      for (const e of entries ?? []) this.entries.set(`${e.did}::${e.appid}`, e);
      this.lastUpdated = lastUpdated ?? 0;
    });
    this.connectSocket().catch(() => {});
    this.state.storage.setAlarm(Date.now() + RECONNECT_ALARM_MS).catch(() => {});
  }

  // ---- firehose ------------------------------------------------------------
  // Workers connect OUT to a WebSocket server via fetch() + an Upgrade header
  // (the documented Cloudflare pattern), same shape as sites/quadrants and
  // sites/quotehof.
  private async connectSocket(): Promise<void> {
    try {
      const resp: any = await fetch(JETSTREAM_URL, { headers: { Upgrade: "websocket" } });
      const ws = resp.webSocket;
      if (!ws) throw new Error("jetstream didn't upgrade");
      ws.accept();
      this.ws = ws;
      this.reconnectDelay = 1000;
      ws.addEventListener("message", (ev: any) => {
        this.handleMessage(String(ev.data)).catch(() => {
          // one bad message shouldn't kill the stream
        });
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

  private async persist(): Promise<void> {
    this.lastUpdated = Date.now();
    await this.state.storage.put({
      entries: Array.from(this.entries.values()),
      lastUpdated: this.lastUpdated,
    });
  }

  private async handleMessage(raw: string): Promise<void> {
    let evt: any;
    try {
      evt = JSON.parse(raw);
    } catch {
      return;
    }
    if (evt.kind !== "commit") return;
    const commit = evt.commit;
    if (!commit || commit.collection !== GLOBAL_COLLECTION) return;
    const did = evt.did;
    if (typeof did !== "string") return;
    const rkey = commit.rkey;
    if (typeof rkey !== "string") return;
    const key = `${did}::${rkey}`;

    if (commit.operation === "delete") {
      if (this.entries.delete(key)) await this.persist();
      return;
    }
    if (commit.operation !== "create" && commit.operation !== "update") return;

    const rec = commit.record;
    if (!rec || typeof rec !== "object") return;
    const appid = Number(rec.appid);
    if (!Number.isFinite(appid)) return;

    const rawTags: any[] = Array.isArray(rec.tags) ? rec.tags : [];
    const tags: GlobalTagRating[] = rawTags
      .filter((t) => t && typeof t.tag === "string" && t.tag.trim() && Number.isFinite(t.score))
      .slice(0, MAX_TAGS_PER_ENTRY)
      .map((t) => ({
        tag: t.tag.trim().slice(0, MAX_TAG_NAME),
        score: Math.max(1, Math.min(10, Math.round(t.score))),
        votes: Number.isFinite(t.votes) ? Math.max(0, Math.round(t.votes)) : 0,
      }));

    if (!tags.length) {
      if (this.entries.delete(key)) await this.persist();
      return;
    }

    if (!this.entries.has(key) && this.entries.size >= MAX_ENTRIES) return; // safety valve

    this.entries.set(key, {
      did,
      appid,
      name: typeof rec.name === "string" ? rec.name.slice(0, 200) : "",
      headerImage: typeof rec.headerImage === "string" ? rec.headerImage.slice(0, 500) : "",
      tags,
      updatedAt: Date.now(),
    });
    await this.persist();
  }

  // ---- aggregation -----------------------------------------------------------
  // Pools every tracked (user, game) rating into a tag -> game leaderboard,
  // independent of any single game — this is deliberately NOT the same shape
  // as the per-user library (which ranks one person's own tag averages); this
  // is everyone's tag ratings, averaged per game and then per tag.
  private buildTagBoards(): GlobalTagBoard[] {
    const tagMap = new Map<
      string,
      { scores: number[]; users: Set<string>; games: Map<number, { name: string; headerImage: string; scores: number[]; users: Set<string> }> }
    >();

    for (const entry of this.entries.values()) {
      for (const t of entry.tags) {
        let bucket = tagMap.get(t.tag);
        if (!bucket) {
          bucket = { scores: [], users: new Set(), games: new Map() };
          tagMap.set(t.tag, bucket);
        }
        bucket.scores.push(t.score);
        bucket.users.add(entry.did);

        let g = bucket.games.get(entry.appid);
        if (!g) {
          g = { name: entry.name, headerImage: entry.headerImage, scores: [], users: new Set() };
          bucket.games.set(entry.appid, g);
        }
        g.scores.push(t.score);
        g.users.add(entry.did);
        if (entry.name) g.name = entry.name;
        if (entry.headerImage) g.headerImage = entry.headerImage;
      }
    }

    const avg = (nums: number[]) => nums.reduce((s, v) => s + v, 0) / nums.length;

    const boards: GlobalTagBoard[] = Array.from(tagMap.entries()).map(([tag, bucket]) => {
      const games: GlobalGameBoard[] = Array.from(bucket.games.entries())
        .map(([appid, g]) => ({
          appid,
          name: g.name,
          headerImage: g.headerImage,
          avgScore: avg(g.scores),
          raterCount: g.users.size,
        }))
        .sort((a, b) => b.avgScore - a.avgScore || b.raterCount - a.raterCount)
        .slice(0, MAX_GAMES_PER_TAG);
      return {
        tag,
        avgScore: avg(bucket.scores),
        ratingCount: bucket.scores.length,
        userCount: bucket.users.size,
        games,
      };
    });

    boards.sort((a, b) => b.avgScore - a.avgScore || b.ratingCount - a.ratingCount);
    return boards.slice(0, MAX_TAGS_SHOWN);
  }

  // ---- alarm: reconnect heartbeat -------------------------------------------
  async alarm(): Promise<void> {
    await this.ready;
    if (!this.wsOpen()) this.connectSocket().catch(() => {});
    await this.state.storage.setAlarm(Date.now() + RECONNECT_ALARM_MS);
  }

  // ---- http -------------------------------------------------------------
  async fetch(request: Request): Promise<Response> {
    await this.ready;
    if (!this.wsOpen()) this.connectSocket().catch(() => {});

    const url = new URL(request.url);
    if (url.pathname === "/api/global") {
      const userCount = new Set(Array.from(this.entries.values()).map((e) => e.did)).size;
      return globalJson({
        updatedAt: this.lastUpdated || null,
        entryCount: this.entries.size,
        userCount,
        tags: this.buildTagBoards(),
      });
    }
    return globalJson({ error: "not found" }, 404);
  }
}
