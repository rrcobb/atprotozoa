// avcart Worker — avcart.bisks.net
//
// A shared 3D classroom (three.js, client-side — see public/scene.js). Pick
// a desk, and the teacher wheels in the AV cart: it plays whichever Bluesky
// account's feed the room has picked, as a "refried" image slideshow with a
// procedural corecore soundtrack. Anyone online can pick the account;
// everyone online sees the same room and the same feed — that shared state
// (who's sitting where, which account is on screen, its image list) lives in
// ONE Durable Object instance (id "global"), the single-writer guarantee a
// shared room needs. Clients poll /api/state every couple seconds, same
// shape as sites/the-place.
//
// This Worker has three jobs:
//   1. Forward /api/* to the Classroom Durable Object.
//   2. /img?u=<cdn.bsky.app url> — a narrow same-origin proxy for avatar and
//      feed-image blobs. cdn.bsky.app sends no CORS header, so loading an
//      image cross-origin with crossOrigin="anonymous" fails outright, and
//      loading without it taints the canvas the refried slideshow draws
//      into (which then throws reading pixels back out for the deep-fry
//      filter). Re-fetching through this same-origin route sidesteps both —
//      copied from sites/beesky's /img route, widened to the feed image
//      variants this site also needs.
//   3. Everything else falls through to the static ASSETS binding.
//
// No @cloudflare/workers-types dependency (house style: self-contained
// deps) — the DO/env shapes below are the narrow slice this file touches,
// same hand-declared style as sites/the-place and sites/didscope.

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
  put(key: string, value: unknown): Promise<void>;
  put(entries: Record<string, unknown>): Promise<void>;
  delete(key: string): Promise<boolean>;
}
interface DurableObjectState {
  storage: DurableObjectStorage;
  blockConcurrencyWhile<T>(fn: () => Promise<T>): Promise<T>;
}

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
  ROOM: DurableObjectNamespace;
}

const IMG_HOST = "cdn.bsky.app";
const IMG_PATH_RE =
  /^\/img\/(avatar|avatar_thumbnail|feed_thumbnail|feed_fullsize)\/plain\/did:[a-z0-9:%._-]+\/[a-z0-9]+(@[a-z]+)?$/i;

async function proxyImage(rawUrl: string | null): Promise<Response> {
  if (!rawUrl) return new Response("missing u", { status: 400 });
  let target: URL;
  try {
    target = new URL(rawUrl);
  } catch {
    return new Response("bad url", { status: 400 });
  }
  if (target.protocol !== "https:" || target.host !== IMG_HOST || !IMG_PATH_RE.test(target.pathname)) {
    return new Response("url not allowed", { status: 400 });
  }
  const upstream = await fetch(target.toString(), {
    cf: { cacheTtl: 86400, cacheEverything: true } as unknown as Record<string, unknown>,
  });
  const headers = new Headers();
  headers.set("content-type", upstream.headers.get("content-type") || "image/jpeg");
  headers.set("access-control-allow-origin", "*");
  // Content-addressed (the CID is in the path) — safe to cache hard.
  headers.set("cache-control", "public, max-age=604800, immutable");
  return new Response(upstream.body, { status: upstream.status, headers });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/img") {
      return proxyImage(url.searchParams.get("u"));
    }

    if (url.pathname.startsWith("/api/")) {
      const id = env.ROOM.idFromName("global");
      const stub = env.ROOM.get(id);
      return stub.fetch(request);
    }

    return env.ASSETS.fetch(request);
  },
};

// ---- shared classroom state -----------------------------------------------

const ROWS = 4;
const COLS = 5;
const SEAT_TIMEOUT_MS = 45_000; // no heartbeat in this long -> seat frees up
const SELECT_COOLDOWN_MS = 5_000; // per IP, so one person can't spam-flip the room
const MAX_IMAGES = 16;
const FEED_PAGES = 4; // up to 400 posts scanned looking for image embeds

const PUB = "https://public.api.bsky.app/xrpc/";

async function xrpc(method: string, params: Record<string, string>): Promise<any> {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(PUB + method + (qs ? "?" + qs : ""), {
    cf: { cacheTtl: 30 } as unknown as Record<string, unknown>,
  });
  if (!res.ok) {
    const e = new Error(`${method} ${res.status}`);
    (e as any).status = res.status;
    throw e;
  }
  return res.json();
}

function cleanHandle(raw: string): string {
  let h = decodeURIComponent(String(raw || "")).trim();
  h = h.replace(/^@/, "");
  const m = h.match(/bsky\.app\/profile\/([^/\s?#]+)/i);
  if (m) h = m[1];
  return h.split(/[/\s?#]/)[0];
}

async function resolveDid(actor: string): Promise<string> {
  if (actor.startsWith("did:")) return actor;
  const r = await xrpc("com.atproto.identity.resolveHandle", { handle: actor });
  if (!r.did) throw new Error("couldn't resolve handle");
  return r.did;
}

interface SlideImage {
  url: string; // proxied, same-origin
  alt: string;
}

async function buildFeed(did: string): Promise<{ images: SlideImage[]; truncated: boolean }> {
  const images: SlideImage[] = [];
  const seen = new Set<string>();
  let cursor = "";
  let truncated = false;

  for (let page = 0; page < FEED_PAGES && images.length < MAX_IMAGES; page++) {
    const params: Record<string, string> = {
      actor: did,
      limit: "100",
      filter: "posts_with_media",
    };
    if (cursor) params.cursor = cursor;
    let d: any;
    try {
      d = await xrpc("app.bsky.feed.getAuthorFeed", params);
    } catch {
      break;
    }
    for (const item of d.feed || []) {
      const embed = item.post && item.post.embed;
      const views = embedImages(embed);
      for (const v of views) {
        if (seen.has(v.thumb)) continue;
        seen.add(v.thumb);
        images.push({ url: "/img?u=" + encodeURIComponent(v.thumb), alt: v.alt || "" });
        if (images.length >= MAX_IMAGES) break;
      }
      if (images.length >= MAX_IMAGES) break;
    }
    cursor = d.cursor;
    if (!cursor) break;
    if (page === FEED_PAGES - 1 && images.length < MAX_IMAGES) truncated = true;
  }
  return { images, truncated };
}

// Only pull directly-embedded images (skip video/link/quote embeds — this
// slideshow only knows how to show pictures).
function embedImages(embed: any): Array<{ thumb: string; alt: string }> {
  if (!embed) return [];
  const t = embed.$type;
  if (t === "app.bsky.embed.images#view") {
    return (embed.images || []).map((i: any) => ({ thumb: i.thumb, alt: i.alt || "" }));
  }
  if (t === "app.bsky.embed.recordWithMedia#view") {
    return embedImages(embed.media);
  }
  return [];
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export class Classroom {
  private state: DurableObjectState;
  private version = 0;
  private seats: Record<string, { sid: string; ts: number }> = {};
  private current: {
    handle: string;
    displayName: string;
    avatar: string;
    images: SlideImage[];
    truncated: boolean;
    selectedAt: number;
  } | null = null;
  private lastSelectByIp = new Map<string, number>();
  private ready: Promise<void>;

  constructor(state: DurableObjectState) {
    this.state = state;
    this.ready = this.state.blockConcurrencyWhile(async () => {
      const [version, seats, current] = await Promise.all([
        this.state.storage.get<number>("version"),
        this.state.storage.get<Record<string, { sid: string; ts: number }>>("seats"),
        this.state.storage.get<Classroom["current"]>("current"),
      ]);
      this.version = version ?? 0;
      this.seats = seats ?? {};
      this.current = current ?? null;
    });
  }

  private async persist(): Promise<void> {
    await this.state.storage.put({
      version: this.version,
      seats: this.seats,
      current: this.current,
    });
  }

  private pruneSeats(): boolean {
    const now = Date.now();
    let changed = false;
    for (const [seat, occ] of Object.entries(this.seats)) {
      if (now - occ.ts > SEAT_TIMEOUT_MS) {
        delete this.seats[seat];
        changed = true;
      }
    }
    return changed;
  }

  private publicState() {
    return {
      version: this.version,
      rows: ROWS,
      cols: COLS,
      seatTimeoutMs: SEAT_TIMEOUT_MS,
      seats: this.seats,
      current: this.current,
    };
  }

  async fetch(request: Request): Promise<Response> {
    await this.ready;
    if (this.pruneSeats()) {
      this.version++;
      await this.persist();
    }
    const url = new URL(request.url);

    if (url.pathname === "/api/state" && request.method === "GET") {
      return json(this.publicState());
    }
    if (url.pathname === "/api/sit" && request.method === "POST") {
      return this.handleSit(request);
    }
    if (url.pathname === "/api/leave" && request.method === "POST") {
      return this.handleLeave(request);
    }
    if (url.pathname === "/api/heartbeat" && request.method === "POST") {
      return this.handleHeartbeat(request);
    }
    if (url.pathname === "/api/select" && request.method === "POST") {
      return this.handleSelect(request);
    }
    return json({ error: "not found" }, 404);
  }

  private validSeat(seat: unknown): seat is string {
    if (typeof seat !== "string") return false;
    const m = seat.match(/^(\d+)-(\d+)$/);
    if (!m) return false;
    const r = Number(m[1]), c = Number(m[2]);
    return r >= 0 && r < ROWS && c >= 0 && c < COLS;
  }

  private async handleSit(request: Request): Promise<Response> {
    let body: { sid?: unknown; seat?: unknown };
    try {
      body = await request.json();
    } catch {
      return json({ error: "bad json" }, 400);
    }
    const sid = String(body.sid || "").slice(0, 64);
    if (!sid) return json({ error: "missing sid" }, 400);
    if (!this.validSeat(body.seat)) return json({ error: "bad seat" }, 400);
    const seat = body.seat as string;

    const occupant = this.seats[seat];
    if (occupant && occupant.sid !== sid) {
      return json({ error: "taken", seats: this.seats }, 409);
    }

    // one seat per sid — free any other seat this session held
    for (const [s, occ] of Object.entries(this.seats)) {
      if (occ.sid === sid && s !== seat) delete this.seats[s];
    }
    this.seats[seat] = { sid, ts: Date.now() };
    this.version++;
    await this.persist();
    return json(this.publicState());
  }

  private async handleLeave(request: Request): Promise<Response> {
    let body: { sid?: unknown };
    try {
      body = await request.json();
    } catch {
      return json({ error: "bad json" }, 400);
    }
    const sid = String(body.sid || "");
    let changed = false;
    for (const [s, occ] of Object.entries(this.seats)) {
      if (occ.sid === sid) {
        delete this.seats[s];
        changed = true;
      }
    }
    if (changed) {
      this.version++;
      await this.persist();
    }
    return json(this.publicState());
  }

  private async handleHeartbeat(request: Request): Promise<Response> {
    let body: { sid?: unknown; seat?: unknown };
    try {
      body = await request.json();
    } catch {
      return json({ error: "bad json" }, 400);
    }
    const sid = String(body.sid || "");
    const seat = String(body.seat || "");
    const occ = this.seats[seat];
    if (occ && occ.sid === sid) {
      occ.ts = Date.now();
      await this.state.storage.put("seats", this.seats);
    }
    return json({ ok: true });
  }

  private async handleSelect(request: Request): Promise<Response> {
    const ip = request.headers.get("cf-connecting-ip") || "anon";
    const now = Date.now();
    const last = this.lastSelectByIp.get(ip) ?? 0;
    const wait = SELECT_COOLDOWN_MS - (now - last);
    if (wait > 0) return json({ error: "cooldown", retryMs: wait }, 429);

    let body: { handle?: unknown };
    try {
      body = await request.json();
    } catch {
      return json({ error: "bad json" }, 400);
    }
    const handle = cleanHandle(String(body.handle || ""));
    if (!handle) return json({ error: "missing handle" }, 400);

    let did: string;
    let profile: any;
    try {
      did = await resolveDid(handle);
      profile = await xrpc("app.bsky.actor.getProfile", { actor: did });
    } catch {
      return json({ error: "couldn't find that account" }, 404);
    }

    const { images, truncated } = await buildFeed(did);
    this.lastSelectByIp.set(ip, now);

    this.current = {
      handle: profile.handle || handle,
      displayName: profile.displayName || profile.handle || handle,
      avatar: profile.avatar ? "/img?u=" + encodeURIComponent(profile.avatar) : "",
      images,
      truncated,
      selectedAt: now,
    };
    this.version++;
    await this.persist();
    return json(this.publicState());
  }
}
