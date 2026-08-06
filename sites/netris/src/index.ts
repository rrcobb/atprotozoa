// netris Worker — netris.bisks.net.
//
// @7778777.online tagged the bot: "battle netris, play competitive tetris
// against online atproto friends." Same shape as sites/bigwalk: the client
// resolves a handle to its moots pool (public AppView, no auth —
// public/lib/cluster.js, copied verbatim) and lines everyone up in a shared
// room. Where bigwalk raced distance down a track, netris runs N
// simultaneous Tetris boards, one per player, simulated entirely
// client-side (public/app.js's Tetris engine) — the one thing that needs a
// server is making it a *battle*: one Durable Object per handle
// (idFromName(handle)) holds live WebSocket presence, hands out a shared
// piece-bag seed so every board deals the identical piece sequence (the
// standard-issue "fair" competitive-Tetris trick), relays attack garbage
// from whoever clears lines to a random still-alive opponent, and tracks who
// tops out in what order to place the match. Same DO shape as
// sites/gridlock's Jam / sites/bigwalk's Walk (WebSocketPair, per-room
// broadcast, blockConcurrencyWhile-loaded storage) — no alarm needed here,
// board simulation and topout detection are entirely client-driven.
//
// Routes (mount is the whole subdomain, no prefix to strip):
//   GET  /n/<handle>               -> personalized-OG unfurl shell, falls
//                                     through to the same SPA index.html
//                                     already renders for /n/<handle>
//   GET  /api/netris/<handle>      -> forwarded to the Match DO as GET /state
//   POST /api/netris/<handle>/seed -> forwarded to the Match DO as POST /seed
//   GET  /api/netris/<handle>/ws   -> forwarded to the Match DO as the WS upgrade
//   everything else                -> ASSETS

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
  MATCH: DurableObjectNamespace;
}

const HANDLE_SEG = "[A-Za-z0-9.-]{1,253}";
const NETRIS_API_RE = new RegExp(`^/api/netris/(${HANDLE_SEG})(/ws|/seed)?$`);
const SHARE_RE = new RegExp(`^/n/(${HANDLE_SEG})/?$`);

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const GENERIC_TITLE = "netris — battle tetris with your moots";
const GENERIC_DESC =
  "Type a Bluesky handle and drop into live competitive Tetris with your mutuals — clear lines to send garbage at a random opponent, last board standing wins.";
const GENERIC_OG_URL = "https://netris.bisks.net/";

// GET /n/<handle> gets its own real URL so every shared room unfurls with
// its own title/description instead of Bluesky caching one generic card for
// every share (see notes/45-sharing-and-virality.md).
async function renderShare(env: Env, request: Request, handle: string): Promise<Response> {
  const base = await env.ASSETS.fetch(new Request(new URL("/", request.url), { method: "GET" }));
  let html = await base.text();

  try {
    const stub = env.MATCH.get(env.MATCH.idFromName(handle.toLowerCase()));
    const stateRes = await stub.fetch(new Request(new URL("/state", request.url)));
    if (!stateRes.ok) throw new Error("no state");
    const state = (await stateRes.json()) as {
      exists: boolean;
      owner?: { displayName: string; handle: string };
      pool?: unknown[];
      bestScore?: number;
      bestBy?: string;
    };
    if (!state.exists || !state.owner) throw new Error("empty room");

    const name = state.owner.displayName?.trim() || state.owner.handle;
    const poolSize = state.pool?.length ?? 0;
    const title = `${name}'s netris room — battle tetris`;
    const desc = state.bestScore
      ? `Battle ${name} and ${poolSize} moot${poolSize === 1 ? "" : "s"} in live Tetris — room record ${state.bestScore.toLocaleString()} pts by ${state.bestBy}. Hop in, live.`
      : `Battle ${name} and ${poolSize} moot${poolSize === 1 ? "" : "s"} in live Tetris — clear lines, send garbage, last board standing wins.`;
    const ogUrl = `https://netris.bisks.net/n/${encodeURIComponent(handle)}`;

    html = html
      .split(GENERIC_TITLE).join(esc(title))
      .split(GENERIC_DESC).join(esc(desc))
      .split(GENERIC_OG_URL).join(ogUrl);

    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=60" },
    });
  } catch {
    // No room yet at this handle (or the DO's unreachable) — still serve the
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

    const apiMatch = url.pathname.match(NETRIS_API_RE);
    if (apiMatch) {
      const [, handle, suffix] = apiMatch;
      const stub = env.MATCH.get(env.MATCH.idFromName(handle.toLowerCase()));
      const inner = new URL(request.url);
      inner.pathname = suffix || "/state";
      return stub.fetch(new Request(inner, request));
    }

    return env.ASSETS.fetch(request);
  },
};

// --- Match Durable Object -------------------------------------------------
//
// One instance per handle (idFromName(handle)). Holds the roster (whoever
// first loaded the room computed it client-side from the public AppView and
// POSTed it once via /seed — every later visitor just reads it back, no
// repeat AppView calls), live WebSocket presence, and the match itself: a
// shared piece-bag seed, per-player score/lines/alive state, and a
// leaderboard of past matches. Board simulation, gravity, and topout
// detection all happen client-side (public/app.js) — the DO only relays
// attack garbage between players and tracks placement order.

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
  lastBoard: number;
}

interface Player {
  seat: string;
  did: string;
  handle: string;
  displayName: string;
  avatar: string;
  lines: number;
  score: number;
  sent: number;
  alive: boolean;
  place: number | null;
}

interface MatchResult {
  seat: string;
  displayName: string;
  handle: string;
  place: number | null;
  lines: number;
  score: number;
  sent: number;
}

interface MatchHistoryEntry {
  at: number;
  winner: string;
  winnerScore: number;
  players: number;
}

const MAX_POOL = 40;
const MAX_TEXT = 256;

const PRESENCE_COLORS = [
  "#ff7a3d", "#4dd6c0", "#f2c94c", "#bb86fc", "#6fcf97", "#56ccf2", "#eb5757", "#f2994a",
];

const COUNTDOWN_MS = 3000; // grace before startedAt — clients show 3-2-1
// Guideline-ish garbage table, indexed by lines cleared in one piece (0-4).
// No combo/back-to-back/T-spin bonus in v1 — see sites/netris/README-ish
// comment in public/app.js for the honest scope note.
const GARBAGE_TABLE = [0, 0, 1, 2, 4];
const SCORE_TABLE = [0, 100, 300, 500, 800];
const BOARD_MIN_INTERVAL_MS = 250; // defensive rate cap on spectator board pushes
const CHEERS = ["🧱", "🔥", "💥", "😤", "👏", "⚡"];
const MAX_HISTORY = 12;

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
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

export class Match {
  private state: DurableObjectState;
  private owner: Rider | null = null;
  private pool: Rider[] = [];
  private kind = "";
  private createdAt = 0;
  private bestScore: number | null = null;
  private bestBy = "";
  private history: MatchHistoryEntry[] = [];
  private sessions = new Map<WebSocket, Session>();

  // in-memory only — a live match doesn't need to survive a DO eviction, and
  // re-seeding an empty lobby on cold start is the right recovery anyway
  private matchState: "lobby" | "playing" = "lobby";
  private startedAt = 0;
  private seed = 0;
  private players = new Map<string, Player>();
  private remaining = 0;
  private nextPlace = 0;

  private ready: Promise<void>;

  constructor(state: DurableObjectState) {
    this.state = state;
    this.ready = this.state.blockConcurrencyWhile(async () => {
      const [owner, pool, kind, createdAt, bestScore, bestBy, history] = await Promise.all([
        this.state.storage.get<Rider>("owner"),
        this.state.storage.get<Rider[]>("pool"),
        this.state.storage.get<string>("kind"),
        this.state.storage.get<number>("createdAt"),
        this.state.storage.get<number>("bestScore"),
        this.state.storage.get<string>("bestBy"),
        this.state.storage.get<MatchHistoryEntry[]>("history"),
      ]);
      this.owner = owner ?? null;
      this.pool = pool ?? [];
      this.kind = kind ?? "";
      this.createdAt = createdAt ?? 0;
      this.bestScore = bestScore ?? null;
      this.bestBy = bestBy ?? "";
      this.history = history ?? [];
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
      bestScore: this.bestScore,
      bestBy: this.bestBy,
      history: this.history,
      presence: this.presenceList(),
      match: this.matchSnapshot(),
    };
  }

  private matchSnapshot() {
    return {
      state: this.matchState,
      startedAt: this.startedAt,
      seed: this.seed,
      players: [...this.players.values()],
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
      if (!this.owner) return new Response("no room here yet", { status: 404 });
      if (request.headers.get("Upgrade") !== "websocket") {
        return new Response("expected websocket", { status: 426 });
      }
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      server.accept();
      this.handleSession(server);
      return new Response(null, { status: 101, webSocket: client });
    }

    return json({ error: "not found" }, 404);
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

  private sendTo(seat: string, msg: unknown) {
    const payload = JSON.stringify(msg);
    for (const [ws, s] of this.sessions) {
      if (s.seat !== seat) continue;
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

  private riderFor(seat: string): Rider | null {
    if (this.owner && seat === "owner") return this.owner;
    return this.pool.find((r) => r.did === seat) ?? null;
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
      lastBoard: 0,
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
      if (this.matchState !== "lobby") return;
      const entrants = [...this.sessions.values()].filter((s) => !s.seat.startsWith("passerby:"));
      const seen = new Set<string>();
      this.players.clear();
      for (const s of entrants) {
        if (seen.has(s.seat)) continue;
        seen.add(s.seat);
        const rider = this.riderFor(s.seat);
        this.players.set(s.seat, {
          seat: s.seat,
          did: rider?.did ?? "",
          handle: rider?.handle ?? s.handle,
          displayName: rider?.displayName ?? s.displayName,
          avatar: rider?.avatar ?? s.avatar,
          lines: 0,
          score: 0,
          sent: 0,
          alive: true,
          place: null,
        });
      }
      if (this.players.size === 0) return; // no identified players — nobody to start
      this.matchState = "playing";
      this.startedAt = Date.now() + COUNTDOWN_MS;
      this.seed = (Math.random() * 0xffffffff) >>> 0;
      this.remaining = this.players.size;
      this.nextPlace = this.players.size;
      this.broadcast({
        t: "match_start",
        startedAt: this.startedAt,
        seed: this.seed,
        players: [...this.players.values()],
      });
      return;
    }

    if (msg.t === "lines") {
      if (this.matchState !== "playing") return;
      const p = this.players.get(session.seat);
      if (!p || !p.alive) return;
      const n = Math.max(0, Math.min(4, Number(msg.n) || 0));
      if (n === 0) return;
      p.lines += n;
      p.score += SCORE_TABLE[n];
      this.broadcast({ t: "score", seat: p.seat, lines: p.lines, score: p.score });

      const garbage = GARBAGE_TABLE[n];
      if (garbage > 0) {
        const targets = [...this.players.values()].filter((o) => o.alive && o.seat !== p.seat);
        if (targets.length > 0) {
          const target = pick(targets);
          p.sent += garbage;
          this.sendTo(target.seat, { t: "garbage", amount: garbage, from: p.seat });
        }
      }
      return;
    }

    if (msg.t === "board") {
      if (this.matchState !== "playing") return;
      const p = this.players.get(session.seat);
      if (!p || !p.alive) return;
      const now = Date.now();
      if (now - session.lastBoard < BOARD_MIN_INTERVAL_MS) return;
      session.lastBoard = now;
      const cells = str(msg.cells, 260);
      if (!cells) return;
      this.broadcast({ t: "board", seat: p.seat, cells }, ws);
      return;
    }

    if (msg.t === "topout") {
      if (this.matchState !== "playing") return;
      this.eliminate(session.seat);
      return;
    }

    if (msg.t === "cheer") {
      this.broadcast({ t: "cheer", seat: session.seat, emoji: pick(CHEERS) });
      return;
    }
  }

  private eliminate(seat: string) {
    const p = this.players.get(seat);
    if (!p || !p.alive) return;
    p.alive = false;
    p.place = this.nextPlace;
    this.nextPlace--;
    this.remaining--;
    this.broadcast({ t: "eliminated", seat: p.seat, place: p.place });
    this.maybeEndMatch();
  }

  private maybeEndMatch() {
    if (this.matchState !== "playing") return;
    if (this.remaining > 1) return;

    for (const p of this.players.values()) {
      if (p.alive) {
        p.alive = false;
        p.place = 1;
      }
    }

    const results: MatchResult[] = [...this.players.values()]
      .map((p) => ({
        seat: p.seat,
        displayName: p.displayName,
        handle: p.handle,
        place: p.place,
        lines: p.lines,
        score: p.score,
        sent: p.sent,
      }))
      .sort((a, b) => (a.place ?? 999) - (b.place ?? 999));

    const winner = results.find((r) => r.place === 1);
    if (winner) {
      if (this.bestScore == null || winner.score > this.bestScore) {
        this.bestScore = winner.score;
        this.bestBy = winner.displayName;
      }
      this.history.push({ at: Date.now(), winner: winner.displayName, winnerScore: winner.score, players: results.length });
    }
    if (this.history.length > MAX_HISTORY) this.history.splice(0, this.history.length - MAX_HISTORY);

    this.matchState = "lobby";
    this.players.clear();
    this.persist({ bestScore: this.bestScore, bestBy: this.bestBy, history: this.history });
    this.broadcast({
      t: "match_over",
      results,
      bestScore: this.bestScore,
      bestBy: this.bestBy,
      history: this.history,
    });
  }
}
