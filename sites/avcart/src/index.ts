// avcart Worker — avcart.bisks.net
//
// A shared 3D classroom (three.js, client-side — see public/scene.js). Pick
// a desk, and the teacher wheels in the AV cart: it plays whichever Bluesky
// account's feed the room has picked, as a "refried" image slideshow with a
// procedural corecore soundtrack. Anyone online can pick the account;
// everyone online sees the same room and the same feed — that shared state
// (who's sitting where, which account is on screen, its image list, and one
// passed note that circulates seat-to-seat) lives in ONE Durable Object
// instance (id "global"), the single-writer guarantee a shared room needs.
// Clients poll /api/state every couple seconds, same shape as
// sites/the-place. The note: whoever holds it can scribble on it with a
// little MS-Paint-style pen (freehand strokes, not typed text) and pass it
// to an occupied, 4-directionally-adjacent seat — nobody can draw on it
// without holding it first, which is what makes it *pass around* the room
// instead of everyone drawing over each other at once.
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
const MAX_STROKES = 24; // oldest doodles fall off once the note fills up
const MAX_STROKE_POINTS = 60; // (x,y) pairs per stroke — keeps polled state small
const COLOR_RE = /^#[0-9a-f]{6}$/i;

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

function adjacentSeats(a: string, b: string): boolean {
  const ma = a.match(/^(\d+)-(\d+)$/);
  const mb = b.match(/^(\d+)-(\d+)$/);
  if (!ma || !mb) return false;
  const dr = Math.abs(Number(ma[1]) - Number(mb[1]));
  const dc = Math.abs(Number(ma[2]) - Number(mb[2]));
  return dr + dc === 1; // 4-directional neighbor, not diagonal
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

interface NoteStroke {
  seat: string;
  color: string;
  points: number[]; // flat [x0, y0, x1, y1, ...], each 0..1 (fraction of the note canvas)
  ts: number;
}

interface NoteState {
  strokes: NoteStroke[];
  holderSeat: string | null;
  updatedAt: number;
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
  private note: NoteState = { strokes: [], holderSeat: null, updatedAt: 0 };
  private ready: Promise<void>;

  constructor(state: DurableObjectState) {
    this.state = state;
    this.ready = this.state.blockConcurrencyWhile(async () => {
      const [version, seats, current, note] = await Promise.all([
        this.state.storage.get<number>("version"),
        this.state.storage.get<Record<string, { sid: string; ts: number }>>("seats"),
        this.state.storage.get<Classroom["current"]>("current"),
        this.state.storage.get<NoteState>("note"),
      ]);
      this.version = version ?? 0;
      this.seats = seats ?? {};
      this.current = current ?? null;
      this.note = note ?? { strokes: [], holderSeat: null, updatedAt: 0 };
    });
  }

  private async persist(): Promise<void> {
    await this.state.storage.put({
      version: this.version,
      seats: this.seats,
      current: this.current,
      note: this.note,
    });
  }

  private findSeatBySid(sid: string): string | null {
    for (const [s, occ] of Object.entries(this.seats)) {
      if (occ.sid === sid) return s;
    }
    return null;
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
    // If the seat holding the passed note emptied out (timeout or leave),
    // the note drops back to unclaimed rather than vanishing with the seat.
    if (this.note.holderSeat && !this.seats[this.note.holderSeat]) {
      this.note.holderSeat = null;
      changed = true;
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
      note: this.note,
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
    if (url.pathname === "/api/note/take" && request.method === "POST") {
      return this.handleNoteTake(request);
    }
    if (url.pathname === "/api/note/scribble" && request.method === "POST") {
      return this.handleNoteScribble(request);
    }
    if (url.pathname === "/api/note/pass" && request.method === "POST") {
      return this.handleNotePass(request);
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
    if (this.note.holderSeat && !this.seats[this.note.holderSeat]) {
      this.note.holderSeat = null;
      changed = true;
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

  private async handleNoteTake(request: Request): Promise<Response> {
    let body: { sid?: unknown };
    try {
      body = await request.json();
    } catch {
      return json({ error: "bad json" }, 400);
    }
    const seat = this.findSeatBySid(String(body.sid || ""));
    if (!seat) return json({ error: "sit down first" }, 400);
    if (this.note.holderSeat) return json({ error: "someone already has it" }, 409);

    this.note.holderSeat = seat;
    this.note.updatedAt = Date.now();
    this.version++;
    await this.persist();
    return json(this.publicState());
  }

  private async handleNoteScribble(request: Request): Promise<Response> {
    let body: { sid?: unknown; stroke?: unknown };
    try {
      body = await request.json();
    } catch {
      return json({ error: "bad json" }, 400);
    }
    const seat = this.findSeatBySid(String(body.sid || ""));
    if (!seat) return json({ error: "sit down first" }, 400);
    if (this.note.holderSeat !== seat) return json({ error: "you don't have the note" }, 403);

    const stroke = body.stroke as { color?: unknown; points?: unknown } | undefined;
    if (!stroke || typeof stroke !== "object") return json({ error: "bad stroke" }, 400);
    const color = typeof stroke.color === "string" && COLOR_RE.test(stroke.color) ? stroke.color : "#171310";

    const points: number[] = [];
    const rawPoints = Array.isArray(stroke.points) ? stroke.points : [];
    for (const p of rawPoints) {
      if (typeof p !== "number" || !Number.isFinite(p)) continue;
      points.push(Math.round(Math.max(0, Math.min(1, p)) * 1000) / 1000);
      if (points.length >= MAX_STROKE_POINTS * 2) break;
    }
    if (points.length < 2) return json({ error: "empty" }, 400);
    if (points.length === 2) points.push(points[0], points[1]); // a tap becomes a dot, not nothing

    this.note.strokes.push({ seat, color, points, ts: Date.now() });
    if (this.note.strokes.length > MAX_STROKES) {
      this.note.strokes.splice(0, this.note.strokes.length - MAX_STROKES);
    }
    this.note.updatedAt = Date.now();
    this.version++;
    await this.persist();
    return json(this.publicState());
  }

  private async handleNotePass(request: Request): Promise<Response> {
    let body: { sid?: unknown; toSeat?: unknown };
    try {
      body = await request.json();
    } catch {
      return json({ error: "bad json" }, 400);
    }
    const seat = this.findSeatBySid(String(body.sid || ""));
    if (!seat) return json({ error: "sit down first" }, 400);
    if (this.note.holderSeat !== seat) return json({ error: "you don't have the note" }, 403);
    if (!this.validSeat(body.toSeat)) return json({ error: "bad seat" }, 400);
    const toSeat = body.toSeat as string;
    if (!adjacentSeats(seat, toSeat)) return json({ error: "not adjacent" }, 400);
    if (!this.seats[toSeat]) return json({ error: "nobody's sitting there" }, 400);

    this.note.holderSeat = toSeat;
    this.note.updatedAt = Date.now();
    this.version++;
    await this.persist();
    return json(this.publicState());
  }
}
