// bigwalk Worker — bigwalk.bisks.net.
//
// @cee.wtf posted "Big Walk is going to inspire a new little bluesky toy i
// know it"; isolyth.dev tagged the bot asking for "at protocol real time
// multiplayer with your friends." Big Walk (the party game) is a walking
// marathon: keep moving or fall to the back of the pack and get picked off.
// The client resolves a handle to its moots pool (public AppView, no auth —
// public/lib/cluster.js, copied verbatim from sites/gridlock) and lines
// everyone up at a start line. The one thing that needs a server: a shared
// room so the race is actually shared — one Durable Object per handle
// (idFromName(handle)) holding live WebSocket presence, the race clock,
// everyone's live distance, and an elimination alarm. Same shape as
// sites/gridlock's Jam DO (WebSocketPair, per-room broadcast,
// blockConcurrencyWhile-loaded storage, a ticking DO alarm), swapped from
// ambient traffic-jam creep to an actual race clock with a finish line.
//
// 2026-08-06, isolyth.dev's mutual (cee.wtf) asked for async multiplayer —
// racing "the ghosts of other players' runs." Every finisher's step trace
// (sparse [msSinceStart, distance] samples) is kept as a GhostRun, one per
// seat, capped at MAX_GHOSTS. Each new race samples up to MAX_ACTIVE_GHOSTS
// of them to pace against — the server counts a ghost's interpolated
// position toward the elimination lead check, so falling behind a ghost can
// get you picked off same as falling behind a live racer, and a room stays
// racy solo. Replay math (ghostDistanceAt) is duplicated client-side so
// ghosts animate smoothly between the server's sparse samples without
// extra network chatter.
//
// Routes (mount is the whole subdomain, no prefix to strip):
//   GET  /w/<handle>             -> personalized-OG unfurl shell, falls
//                                   through to the same SPA index.html
//                                   already renders for /w/<handle>
//   GET  /api/walk/<handle>      -> forwarded to the Walk DO as GET /state
//   POST /api/walk/<handle>/seed -> forwarded to the Walk DO as POST /seed
//   GET  /api/walk/<handle>/ws   -> forwarded to the Walk DO as the WS upgrade
//   everything else              -> ASSETS

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
  getAlarm(): Promise<number | null>;
  setAlarm(time: number): Promise<void>;
}
interface DurableObjectState {
  storage: DurableObjectStorage;
  blockConcurrencyWhile<T>(fn: () => Promise<T>): Promise<T>;
}
interface WebSocketPair {
  0: WebSocket;
  1: WebSocket;
}
declare const WebSocketPair: { new (): WebSocketPair };

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
  WALK: DurableObjectNamespace;
}

const HANDLE_SEG = "[A-Za-z0-9.-]{1,253}";
const WALK_API_RE = new RegExp(`^/api/walk/(${HANDLE_SEG})(/ws|/seed)?$`);
const SHARE_RE = new RegExp(`^/w/(${HANDLE_SEG})/?$`);

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const GENERIC_TITLE = "bigwalk — race your moots, live";
const GENERIC_DESC =
  "Type a Bluesky handle and race your mutuals down a real-time track — alternate left/right to walk, keep pace or get picked off the back of the pack.";
const GENERIC_OG_URL = "https://bigwalk.bisks.net/";

// GET /w/<handle> gets its own real URL so every shared walk unfurls with
// its own title/description instead of Bluesky caching one generic card for
// every share (same fix as sites/gridlock — see notes/45-sharing-and-virality.md).
async function renderShare(env: Env, request: Request, handle: string): Promise<Response> {
  const base = await env.ASSETS.fetch(new Request(new URL("/", request.url), { method: "GET" }));
  let html = await base.text();

  try {
    const stub = env.WALK.get(env.WALK.idFromName(handle.toLowerCase()));
    const stateRes = await stub.fetch(new Request(new URL("/state", request.url)));
    if (!stateRes.ok) throw new Error("no state");
    const state = (await stateRes.json()) as {
      exists: boolean;
      owner?: { displayName: string; handle: string };
      pool?: unknown[];
      bestMs?: number;
      bestBy?: string;
    };
    if (!state.exists || !state.owner) throw new Error("empty walk");

    const name = state.owner.displayName?.trim() || state.owner.handle;
    const poolSize = state.pool?.length ?? 0;
    const title = `${name}'s walk — bigwalk`;
    const desc = state.bestMs
      ? `Race ${name} and ${poolSize} moot${poolSize === 1 ? "" : "s"} down the track — track record ${(state.bestMs / 1000).toFixed(1)}s by ${state.bestBy}. Hop in, live.`
      : `Race ${name} and ${poolSize} moot${poolSize === 1 ? "" : "s"} down the track. Alternate left/right to walk — hop in, live.`;
    const ogUrl = `https://bigwalk.bisks.net/w/${encodeURIComponent(handle)}`;

    html = html
      .split(GENERIC_TITLE).join(esc(title))
      .split(GENERIC_DESC).join(esc(desc))
      .split(GENERIC_OG_URL).join(ogUrl);

    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=60" },
    });
  } catch {
    // No walk yet at this handle (or the DO's unreachable) — still serve the
    // live shell so the link isn't dead; the client kicks off a fresh room.
    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" },
    });
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    const shareMatch = url.pathname.match(SHARE_RE);
    if (shareMatch && request.method === "GET") {
      return renderShare(env, request, shareMatch[1]);
    }

    const apiMatch = url.pathname.match(WALK_API_RE);
    if (apiMatch) {
      const [, handle, suffix] = apiMatch;
      const stub = env.WALK.get(env.WALK.idFromName(handle.toLowerCase()));
      const inner = new URL(request.url);
      inner.pathname = suffix || "/state";
      return stub.fetch(new Request(inner, request));
    }

    return env.ASSETS.fetch(request);
  },
};

// --- Walk Durable Object -------------------------------------------------
//
// One instance per handle (idFromName(handle)). Holds the roster (whoever
// first loaded the room computed it client-side from the public AppView and
// POSTed it once via /seed — every later visitor just reads it back, no
// repeat AppView calls), live WebSocket presence, and the race itself:
// state, per-walker distance, finishes, eliminations, and a leaderboard of
// past races.

interface Rider {
  did: string;
  handle: string;
  displayName: string;
  avatar: string;
}

interface Session {
  id: string;
  seat: string; // "owner" | pool member's did | "passerby:<id>"
  handle: string;
  displayName: string;
  avatar: string;
  color: string;
  lastStep: number;
  lastFoot: string;
}

interface Walker {
  seat: string;
  did: string;
  handle: string;
  displayName: string;
  avatar: string;
  distance: number;
  finished: boolean;
  finishMs: number | null;
  place: number | null;
  eliminated: boolean;
}

interface RaceResult {
  seat: string;
  displayName: string;
  handle: string;
  place: number | null;
  finishMs: number | null;
  eliminated: boolean;
  distance: number;
}

interface RaceHistoryEntry {
  at: number;
  winner: string;
  winnerMs: number | null;
  racers: number;
}

// A ghost is a past racer's finished run, replayed as a pace-setter in later
// races — this is what makes the room playable async/solo: even with nobody
// else online, you're racing whoever finished here before you. samples are
// sparse [msSinceStart, distance] points recorded from that racer's actual
// steps; finishMs anchors the tail (distance == TRACK_METERS at finishMs).
interface GhostRun {
  seat: string;
  did: string;
  handle: string;
  displayName: string;
  avatar: string;
  finishMs: number;
  samples: [number, number][];
  recordedAt: number;
}

const MAX_POOL = 40;
const MAX_TEXT = 256;
const MAX_GHOSTS = 16; // one personal-best ghost per seat, capped total
const MAX_ACTIVE_GHOSTS = 4; // how many pace a single race

const PRESENCE_COLORS = [
  "#ff7a3d", "#4dd6c0", "#f2c94c", "#bb86fc", "#6fcf97", "#56ccf2", "#eb5757", "#f2994a",
];

const TRACK_METERS = 300;
const STEP_COOLDOWN_MS = 65; // fastest a single foot can land — caps spam, humans alternate slower anyway
const STEP_GAIN_MIN = 0.85;
const STEP_GAIN_MAX = 1.35;
const COUNTDOWN_MS = 3000; // grace before startedAt — clients show 3-2-1
const GRACE_MS = 6000; // no eliminations for this long after the race actually starts
const ELIM_CHECK_MS = 5000;
const ELIM_LAG_METERS = 55; // fall this far behind the leader during a check and you're picked off
const CHEERS = ["👏", "💪", "🔥", "😤", "🚶", "🫡"];
const MAX_HISTORY = 12;

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function sample<T>(arr: T[], n: number): T[] {
  const pool = [...arr];
  const out: T[] = [];
  while (pool.length && out.length < n) {
    out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  }
  return out;
}

// Linear interpolation of a ghost's distance at a given elapsed race time —
// used both for the elimination pace check and to seed the client's replay.
function ghostDistanceAt(g: GhostRun, elapsedMs: number): number {
  if (elapsedMs <= 0) return 0;
  if (elapsedMs >= g.finishMs) return TRACK_METERS;
  let prev: [number, number] = g.samples[0] ?? [0, 0];
  for (const s of g.samples) {
    if (s[0] <= elapsedMs) {
      prev = s;
    } else {
      const [t0, d0] = prev;
      const [t1, d1] = s;
      const frac = t1 === t0 ? 0 : (elapsedMs - t0) / (t1 - t0);
      return d0 + (d1 - d0) * frac;
    }
  }
  return prev[1];
}

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json", "access-control-allow-origin": "*" },
  });
}

function colorFor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return PRESENCE_COLORS[h % PRESENCE_COLORS.length];
}

function str(v: unknown, max: number): string {
  return typeof v === "string" ? v.slice(0, max) : "";
}

function cleanRider(v: unknown): Rider | null {
  if (!v || typeof v !== "object") return null;
  const r = v as Record<string, unknown>;
  const did = str(r.did, 128);
  const handle = str(r.handle, 253);
  if (!did || !handle) return null;
  return {
    did,
    handle,
    displayName: str(r.displayName, MAX_TEXT) || handle,
    avatar: str(r.avatar, 512),
  };
}

export class Walk {
  private state: DurableObjectState;
  private owner: Rider | null = null;
  private pool: Rider[] = [];
  private kind = "";
  private createdAt = 0;
  private bestMs: number | null = null;
  private bestBy = "";
  private history: RaceHistoryEntry[] = [];
  private ghosts: GhostRun[] = [];
  private sessions = new Map<WebSocket, Session>();

  // in-memory only — a live race doesn't need to survive a DO eviction, and
  // re-seeding an empty lobby on cold start is the right recovery anyway
  private raceState: "lobby" | "racing" = "lobby";
  private startedAt = 0;
  private walkers = new Map<string, Walker>();
  private finishOrder = 0;
  private traces = new Map<string, [number, number][]>();
  private activeGhosts: GhostRun[] = [];

  private ready: Promise<void>;

  constructor(state: DurableObjectState) {
    this.state = state;
    this.ready = this.state.blockConcurrencyWhile(async () => {
      const [owner, pool, kind, createdAt, bestMs, bestBy, history, ghosts] = await Promise.all([
        this.state.storage.get<Rider>("owner"),
        this.state.storage.get<Rider[]>("pool"),
        this.state.storage.get<string>("kind"),
        this.state.storage.get<number>("createdAt"),
        this.state.storage.get<number>("bestMs"),
        this.state.storage.get<string>("bestBy"),
        this.state.storage.get<RaceHistoryEntry[]>("history"),
        this.state.storage.get<GhostRun[]>("ghosts"),
      ]);
      this.owner = owner ?? null;
      this.pool = pool ?? [];
      this.kind = kind ?? "";
      this.createdAt = createdAt ?? 0;
      this.bestMs = bestMs ?? null;
      this.bestBy = bestBy ?? "";
      this.history = history ?? [];
      this.ghosts = ghosts ?? [];
    });
  }

  private persist(keys: Record<string, unknown>) {
    this.state.storage.put(keys).catch(() => {});
  }

  private snapshot() {
    return {
      exists: !!this.owner,
      owner: this.owner,
      pool: this.pool,
      kind: this.kind,
      createdAt: this.createdAt,
      trackMeters: TRACK_METERS,
      bestMs: this.bestMs,
      bestBy: this.bestBy,
      history: this.history,
      ghostCount: this.ghosts.length,
      presence: this.presenceList(),
      race: this.raceSnapshot(),
    };
  }

  private raceSnapshot() {
    return {
      state: this.raceState,
      startedAt: this.startedAt,
      walkers: [...this.walkers.values()],
      ghosts: this.raceState === "racing" ? this.activeGhosts : [],
    };
  }

  private presenceList() {
    return [...this.sessions.values()].map((s) => ({
      id: s.id,
      seat: s.seat,
      handle: s.handle,
      displayName: s.displayName,
      avatar: s.avatar,
      color: s.color,
    }));
  }

  async fetch(request: Request): Promise<Response> {
    await this.ready;
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "GET, POST, OPTIONS",
          "access-control-allow-headers": "content-type",
        },
      });
    }

    if (url.pathname === "/state" && request.method === "GET") {
      return json(this.snapshot());
    }

    if (url.pathname === "/seed" && request.method === "POST") {
      if (this.owner) {
        // Already rolling — idempotent no-op so a revisiting owner's client
        // can always just POST /seed without checking first.
        return json({ ok: true, alreadyExists: true, ...this.snapshot() });
      }
      const body = (await request.json().catch(() => null)) as
        | { owner?: unknown; pool?: unknown; kind?: unknown }
        | null;
      const owner = cleanRider(body?.owner);
      if (!owner) return json({ error: "bad owner" }, 400);
      const rawPool = Array.isArray(body?.pool) ? (body!.pool as unknown[]) : [];
      const seen = new Set([owner.did]);
      const pool: Rider[] = [];
      for (const r of rawPool) {
        const c = cleanRider(r);
        if (!c || seen.has(c.did)) continue;
        seen.add(c.did);
        pool.push(c);
        if (pool.length >= MAX_POOL) break;
      }
      this.owner = owner;
      this.pool = pool;
      this.kind = str(body?.kind, 32) || "moots";
      this.createdAt = Date.now();
      this.persist({ owner: this.owner, pool: this.pool, kind: this.kind, createdAt: this.createdAt });
      return json({ ok: true, alreadyExists: false, ...this.snapshot() });
    }

    if (url.pathname === "/ws") {
      if (!this.owner) return new Response("no walk here yet", { status: 404 });
      if (request.headers.get("Upgrade") !== "websocket") {
        return new Response("expected websocket", { status: 426 });
      }
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      server.accept();
      this.handleSession(server);
      if (this.raceState === "racing") await this.ensureElimAlarm();
      return new Response(null, { status: 101, webSocket: client });
    }

    return json({ error: "not found" }, 404);
  }

  private async ensureElimAlarm() {
    const existing = await this.state.storage.getAlarm();
    if (existing) return;
    await this.state.storage.setAlarm(Date.now() + ELIM_CHECK_MS);
  }

  async alarm() {
    await this.ready;
    if (this.raceState !== "racing") return;
    if (this.sessions.size === 0) return; // empty room — let it lapse, next connect re-arms it

    this.checkEliminations();

    if (this.raceState === "racing") {
      await this.state.storage.setAlarm(Date.now() + ELIM_CHECK_MS);
    }
  }

  private activeWalkers(): Walker[] {
    return [...this.walkers.values()].filter((w) => !w.finished && !w.eliminated);
  }

  private checkEliminations() {
    if (Date.now() - this.startedAt < GRACE_MS) return;
    const active = this.activeWalkers();
    if (active.length === 0) {
      this.maybeEndRace();
      return;
    }
    const elapsed = Date.now() - this.startedAt;
    const ghostDistances = this.activeGhosts.map((g) => ghostDistanceAt(g, elapsed));
    // With nobody left to fall behind — no other live walker, no ghost
    // pacing this race — there's no pack to get picked off from.
    if (active.length <= 1 && ghostDistances.length === 0) {
      this.maybeEndRace();
      return;
    }
    const leadDistance = Math.max(
      ...[...this.walkers.values()].filter((w) => !w.eliminated).map((w) => w.distance),
      ...ghostDistances,
      0,
    );
    for (const w of active) {
      if (leadDistance - w.distance >= ELIM_LAG_METERS) {
        w.eliminated = true;
        this.broadcast({ t: "eliminated", seat: w.seat, distance: w.distance });
      }
    }
    this.maybeEndRace();
  }

  private maybeEndRace() {
    if (this.raceState !== "racing") return;
    const stillActive = this.activeWalkers();
    if (stillActive.length > 0) return;

    const results: RaceResult[] = [...this.walkers.values()]
      .map((w) => ({
        seat: w.seat,
        displayName: w.displayName,
        handle: w.handle,
        place: w.place,
        finishMs: w.finishMs,
        eliminated: w.eliminated,
        distance: Math.round(w.distance),
      }))
      .sort((a, b) => (a.place ?? 999) - (b.place ?? 999) || b.distance - a.distance);

    const winner = results.find((r) => r.place === 1);
    if (winner && winner.finishMs != null) {
      if (this.bestMs == null || winner.finishMs < this.bestMs) {
        this.bestMs = winner.finishMs;
        this.bestBy = winner.displayName;
      }
      this.history.push({ at: Date.now(), winner: winner.displayName, winnerMs: winner.finishMs, racers: results.length });
    } else {
      this.history.push({ at: Date.now(), winner: "nobody", winnerMs: null, racers: results.length });
    }
    if (this.history.length > MAX_HISTORY) this.history.splice(0, this.history.length - MAX_HISTORY);

    this.recordGhosts();

    this.raceState = "lobby";
    this.walkers.clear();
    this.activeGhosts = [];
    this.traces.clear();
    this.persist({ bestMs: this.bestMs, bestBy: this.bestBy, history: this.history, ghosts: this.ghosts });
    this.broadcast({
      t: "race_over",
      results,
      bestMs: this.bestMs,
      bestBy: this.bestBy,
      history: this.history,
      ghostCount: this.ghosts.length,
    });
  }

  // Every walker who actually finished leaves behind a ghost — their step
  // trace replayed as a pace-setter in future races. Keeps at most one
  // (their fastest) ghost per seat, capped at MAX_GHOSTS total so the room's
  // storage doesn't grow without bound.
  private recordGhosts() {
    for (const w of this.walkers.values()) {
      if (!w.finished || w.finishMs == null) continue;
      const trace = this.traces.get(w.seat);
      if (!trace || !trace.length) continue;
      const run: GhostRun = {
        seat: w.seat,
        did: w.did,
        handle: w.handle,
        displayName: w.displayName,
        avatar: w.avatar,
        finishMs: w.finishMs,
        samples: trace,
        recordedAt: Date.now(),
      };
      const existingIdx = this.ghosts.findIndex((g) => g.seat === w.seat);
      if (existingIdx >= 0) {
        if (run.finishMs < this.ghosts[existingIdx].finishMs) this.ghosts[existingIdx] = run;
      } else {
        this.ghosts.push(run);
      }
    }
    if (this.ghosts.length > MAX_GHOSTS) {
      this.ghosts.sort((a, b) => a.finishMs - b.finishMs);
      this.ghosts.length = MAX_GHOSTS;
    }
  }

  private broadcast(msg: unknown, exclude?: WebSocket) {
    const payload = JSON.stringify(msg);
    for (const ws of this.sessions.keys()) {
      if (ws === exclude) continue;
      try {
        ws.send(payload);
      } catch {
        this.sessions.delete(ws);
      }
    }
  }

  private seatFor(did: string): string {
    if (this.owner && did && did === this.owner.did) return "owner";
    const match = this.pool.find((r) => r.did === did);
    return match ? match.did : "";
  }

  private handleSession(ws: WebSocket) {
    const id = crypto.randomUUID();
    const session: Session = {
      id,
      seat: `passerby:${id}`,
      handle: "",
      displayName: "a passerby",
      avatar: "",
      color: colorFor(id),
      lastStep: 0,
      lastFoot: "",
    };
    this.sessions.set(ws, session);

    ws.send(JSON.stringify({ t: "init", you: { id, seat: session.seat }, ...this.snapshot() }));

    ws.addEventListener("message", (evt: MessageEvent) => {
      try {
        this.onMessage(ws, session, JSON.parse(String(evt.data)));
      } catch {
        // malformed message — ignore, don't take the DO down
      }
    });
    const onClose = () => {
      if (!this.sessions.delete(ws)) return;
      this.broadcast({ t: "presence", presence: this.presenceList() });
    };
    ws.addEventListener("close", onClose);
    ws.addEventListener("error", onClose);
  }

  private riderFor(seat: string): Rider | null {
    if (this.owner && seat === "owner") return this.owner;
    return this.pool.find((r) => r.did === seat) ?? null;
  }

  private onMessage(ws: WebSocket, session: Session, msg: any) {
    if (!msg || typeof msg !== "object") return;

    if (msg.t === "hello") {
      const did = str(msg.did, 128);
      session.handle = str(msg.handle, 253);
      session.displayName = str(msg.displayName, MAX_TEXT) || session.handle || "a passerby";
      session.avatar = str(msg.avatar, 512);
      const seat = did ? this.seatFor(did) : "";
      session.seat = seat || `passerby:${session.id}`;
      ws.send(JSON.stringify({ t: "seat", id: session.id, seat: session.seat }));
      this.broadcast({ t: "presence", presence: this.presenceList() });
      return;
    }

    if (msg.t === "start") {
      if (this.raceState !== "lobby") return;
      const entrants = [...this.sessions.values()].filter((s) => !s.seat.startsWith("passerby:"));
      const seen = new Set<string>();
      this.walkers.clear();
      for (const s of entrants) {
        if (seen.has(s.seat)) continue;
        seen.add(s.seat);
        const rider = this.riderFor(s.seat);
        this.walkers.set(s.seat, {
          seat: s.seat,
          did: rider?.did ?? "",
          handle: rider?.handle ?? s.handle,
          displayName: rider?.displayName ?? s.displayName,
          avatar: rider?.avatar ?? s.avatar,
          distance: 0,
          finished: false,
          finishMs: null,
          place: null,
          eliminated: false,
        });
      }
      if (this.walkers.size === 0) return; // no identified racers — nobody to start
      this.raceState = "racing";
      this.startedAt = Date.now() + COUNTDOWN_MS;
      this.finishOrder = 0;
      this.traces.clear();
      const liveSeats = new Set(this.walkers.keys());
      this.activeGhosts = sample(
        this.ghosts.filter((g) => !liveSeats.has(g.seat)),
        MAX_ACTIVE_GHOSTS,
      );
      this.state.storage.setAlarm(this.startedAt + GRACE_MS).catch(() => {});
      this.broadcast({
        t: "race_start",
        startedAt: this.startedAt,
        walkers: [...this.walkers.values()],
        ghosts: this.activeGhosts,
      });
      return;
    }

    if (msg.t === "step") {
      if (this.raceState !== "racing") return;
      if (Date.now() < this.startedAt) return; // still in the countdown
      const w = this.walkers.get(session.seat);
      if (!w || w.finished || w.eliminated) return;
      const foot = msg.foot === "L" || msg.foot === "R" ? msg.foot : null;
      if (!foot) return;
      const now = Date.now();
      if (now - session.lastStep < STEP_COOLDOWN_MS) return;
      if (foot === session.lastFoot) return; // must alternate feet, like actually walking
      session.lastFoot = foot;
      session.lastStep = now;

      w.distance = Math.min(TRACK_METERS, w.distance + STEP_GAIN_MIN + Math.random() * (STEP_GAIN_MAX - STEP_GAIN_MIN));
      let place: number | null = null;
      if (w.distance >= TRACK_METERS && !w.finished) {
        w.finished = true;
        w.finishMs = now - this.startedAt;
        this.finishOrder++;
        w.place = this.finishOrder;
        place = w.place;
      }
      const trace = this.traces.get(w.seat);
      if (trace) trace.push([now - this.startedAt, w.distance]);
      else this.traces.set(w.seat, [[now - this.startedAt, w.distance]]);
      this.broadcast({ t: "pos", seat: w.seat, distance: w.distance, finished: w.finished, place });
      if (w.finished) this.maybeEndRace();
      return;
    }

    if (msg.t === "cheer") {
      this.broadcast({ t: "cheer", seat: session.seat, emoji: pick(CHEERS) });
      return;
    }
  }
}
