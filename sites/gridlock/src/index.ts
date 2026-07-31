// gridlock Worker — gridlock.bisks.net.
//
// @words.bsky.social asked for a "sitting in traffic simulator where you sit
// next to your mutuals and work together to thread messages or alleviate
// boredom." The client resolves a handle to its moots pool (public AppView,
// no auth — public/lib/cluster.js) and lays them out as a jam. The one thing
// that needs a server: a shared room so the jam is actually shared — a tiny
// Durable Object per handle (idFromName(handle)) holding live WebSocket
// presence, a CB-radio note thread, a synced honk counter, and a co-op
// "spot it" checklist. Same shape as sites/docmoot's Doc DO, stripped of the
// operational-transform text-editing part since a jam doesn't need it.
//
// Routes (mount is the whole subdomain, no prefix to strip):
//   GET  /j/<handle>            -> personalized-OG unfurl shell, falls
//                                   through to the same SPA index.html
//                                   already renders for /j/<handle>
//   GET  /api/jam/<handle>      -> forwarded to the Jam DO as GET /state
//   POST /api/jam/<handle>/seed -> forwarded to the Jam DO as POST /seed
//   GET  /api/jam/<handle>/ws   -> forwarded to the Jam DO as the WS upgrade
//   everything else             -> ASSETS

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
  JAM: DurableObjectNamespace;
}

const HANDLE_SEG = "[A-Za-z0-9.-]{1,253}";
const JAM_API_RE = new RegExp(`^/api/jam/(${HANDLE_SEG})(/ws|/seed)?$`);
const SHARE_RE = new RegExp(`^/j/(${HANDLE_SEG})/?$`);

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const GENERIC_TITLE = "gridlock — sit in traffic with your moots";
const GENERIC_DESC =
  "Type a Bluesky handle and get stuck in a bumper-to-bumper jam with your mutuals — pass notes on the CB, honk, and work the road-trip checklist together, live.";
const GENERIC_OG_URL = "https://gridlock.bisks.net/";

// GET /j/<handle> gets its own real URL so every shared jam unfurls with its
// own title/description instead of Bluesky caching one generic card for
// every share (same fix as sites/docmoot, sites/mootree — see
// notes/45-sharing-and-virality.md).
async function renderShare(env: Env, request: Request, handle: string): Promise<Response> {
  const base = await env.ASSETS.fetch(new Request(new URL("/", request.url), { method: "GET" }));
  let html = await base.text();

  try {
    const stub = env.JAM.get(env.JAM.idFromName(handle.toLowerCase()));
    const stateRes = await stub.fetch(new Request(new URL("/state", request.url)));
    if (!stateRes.ok) throw new Error("no state");
    const state = (await stateRes.json()) as {
      exists: boolean;
      owner?: { displayName: string; handle: string };
      pool?: unknown[];
    };
    if (!state.exists || !state.owner) throw new Error("empty jam");

    const name = state.owner.displayName?.trim() || state.owner.handle;
    const poolSize = state.pool?.length ?? 0;
    const title = `${name}'s jam — gridlock`;
    const desc = `Stuck in traffic with ${name} and ${poolSize} moot${poolSize === 1 ? "" : "s"}. Hop in, honk the horn, pass a note on the CB.`;
    const ogUrl = `https://gridlock.bisks.net/j/${encodeURIComponent(handle)}`;

    html = html
      .split(GENERIC_TITLE).join(esc(title))
      .split(GENERIC_DESC).join(esc(desc))
      .split(GENERIC_OG_URL).join(ogUrl);

    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=60" },
    });
  } catch {
    // No jam yet at this handle (or the DO's unreachable) — still serve the
    // live shell so the link isn't dead; the client kicks off a fresh jam.
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

    const apiMatch = url.pathname.match(JAM_API_RE);
    if (apiMatch) {
      const [, handle, suffix] = apiMatch;
      const stub = env.JAM.get(env.JAM.idFromName(handle.toLowerCase()));
      const inner = new URL(request.url);
      inner.pathname = suffix || "/state";
      return stub.fetch(new Request(inner, request));
    }

    return env.ASSETS.fetch(request);
  },
};

// --- Jam Durable Object -------------------------------------------------
//
// One instance per handle (idFromName(handle)). Holds the roster (whoever
// first loaded the jam computed it client-side from the public AppView and
// POSTed it once via /seed — every later visitor just reads it back, no
// repeat AppView calls), live WebSocket presence, a capped note thread, a
// honk counter, and a co-op "spot it" board.

interface Rider {
  did: string;
  handle: string;
  displayName: string;
  avatar: string;
}

interface Note {
  id: string;
  seat: string;
  handle: string;
  displayName: string;
  avatar: string;
  text: string;
  at: number;
}

interface Session {
  id: string;
  seat: string; // "owner" | pool member's did | "passerby:<id>"
  handle: string;
  displayName: string;
  avatar: string;
  color: string;
  lastAction: number;
}

const MAX_POOL = 40;
const MAX_NOTE_LEN = 180;
const MAX_TEXT = 256;
const MAX_NOTES_STORED = 300;
const NOTES_ON_INIT = 50;
const ACTION_COOLDOWN_MS = 500;

const BOARD_ITEMS = [
  "someone singing along, badly",
  "brake lights ripple off into the distance",
  "a trucker gives the horn-pull signal back",
  "a dog with its head out the window",
  "someone lane-changes and gains nothing",
  "an ambulance threads through, everyone freezes",
  "the light turns green and nobody moves for 3 full seconds",
  "bumper sticker philosophy",
  "someone visibly mid-argument on a call",
  "a motorcycle splits the lane",
  "someone eating something they really shouldn't be",
  "a car with one working headlight",
];

const PRESENCE_COLORS = [
  "#ff7a3d", "#4dd6c0", "#f2c94c", "#bb86fc", "#6fcf97", "#56ccf2", "#eb5757", "#f2994a",
];

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

export class Jam {
  private state: DurableObjectState;
  private owner: Rider | null = null;
  private pool: Rider[] = [];
  private kind = "";
  private createdAt = 0;
  private notes: Note[] = [];
  private honks = 0;
  private lastHonkBy = "";
  private spotted: Record<number, { by: string; at: number }> = {};
  private clears = 0;
  private sessions = new Map<WebSocket, Session>();
  private ready: Promise<void>;

  constructor(state: DurableObjectState) {
    this.state = state;
    this.ready = this.state.blockConcurrencyWhile(async () => {
      const [owner, pool, kind, createdAt, notes, honks, lastHonkBy, spotted, clears] = await Promise.all([
        this.state.storage.get<Rider>("owner"),
        this.state.storage.get<Rider[]>("pool"),
        this.state.storage.get<string>("kind"),
        this.state.storage.get<number>("createdAt"),
        this.state.storage.get<Note[]>("notes"),
        this.state.storage.get<number>("honks"),
        this.state.storage.get<string>("lastHonkBy"),
        this.state.storage.get<Record<number, { by: string; at: number }>>("spotted"),
        this.state.storage.get<number>("clears"),
      ]);
      this.owner = owner ?? null;
      this.pool = pool ?? [];
      this.kind = kind ?? "";
      this.createdAt = createdAt ?? 0;
      this.notes = notes ?? [];
      this.honks = honks ?? 0;
      this.lastHonkBy = lastHonkBy ?? "";
      this.spotted = spotted ?? {};
      this.clears = clears ?? 0;
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
      board: BOARD_ITEMS,
      notes: this.notes.slice(-NOTES_ON_INIT),
      honks: this.honks,
      lastHonkBy: this.lastHonkBy,
      spotted: this.spotted,
      clears: this.clears,
      createdAt: this.createdAt,
      presence: this.presenceList(),
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
      if (!this.owner) return new Response("no jam here yet", { status: 404 });
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
      lastAction: 0,
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

  private throttled(session: Session): boolean {
    const now = Date.now();
    if (now - session.lastAction < ACTION_COOLDOWN_MS) return true;
    session.lastAction = now;
    return false;
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

    if (msg.t === "note") {
      if (this.throttled(session)) return;
      const text = str(msg.text, MAX_NOTE_LEN).trim();
      if (!text) return;
      const note: Note = {
        id: crypto.randomUUID(),
        seat: session.seat,
        handle: session.handle,
        displayName: session.displayName || "a passerby",
        avatar: session.avatar,
        text,
        at: Date.now(),
      };
      this.notes.push(note);
      if (this.notes.length > MAX_NOTES_STORED) this.notes.splice(0, this.notes.length - MAX_NOTES_STORED);
      this.persist({ notes: this.notes });
      this.broadcast({ t: "note", note });
      return;
    }

    if (msg.t === "honk") {
      if (this.throttled(session)) return;
      this.honks++;
      this.lastHonkBy = session.displayName || "a passerby";
      this.persist({ honks: this.honks, lastHonkBy: this.lastHonkBy });
      this.broadcast({ t: "honk", honks: this.honks, by: this.lastHonkBy, seat: session.seat });
      return;
    }

    if (msg.t === "spot") {
      const i = Math.floor(Number(msg.i));
      if (!Number.isInteger(i) || i < 0 || i >= BOARD_ITEMS.length) return;
      if (this.spotted[i]) return; // already claimed
      this.spotted[i] = { by: session.displayName || "a passerby", at: Date.now() };
      let cleared = false;
      if (Object.keys(this.spotted).length >= BOARD_ITEMS.length) {
        cleared = true;
        this.clears++;
      }
      this.broadcast({
        t: "spot",
        i,
        by: this.spotted[i].by,
        at: this.spotted[i].at,
        cleared,
        clears: this.clears,
      });
      if (cleared) {
        // Board's fully spotted — celebrate, then open a fresh round.
        this.spotted = {};
      }
      this.persist({ spotted: this.spotted, clears: this.clears });
      return;
    }
  }
}
