// the-place Worker — the-place.bisks.net
//
// One shared pixel canvas. No login, no per-user anything: anyone who loads
// the page can drop a pixel (one every few seconds, rate-limited by IP), and
// everyone sees the same grid. At 00:00 UTC the finished canvas is archived
// and a fresh blank one starts — "one website a day," collaboratively drawn.
// Past days stay browsable (read-only) via /api/state?day=YYYY-MM-DD.
//
// All shared state lives in ONE Durable Object instance (id "global") — the
// single-writer guarantee a shared canvas actually needs. No @cloudflare/
// workers-types dependency (house style: self-contained deps); the DO/env
// shapes below are just the narrow slice this file touches, hand-declared
// the same way sites/didscope hand-declares its Env.

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

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
  CANVAS: DurableObjectNamespace;
}

// r/place-flavored 16-color palette. Index 0 is the blank/background color.
const PALETTE = [
  "#ffffff", "#e4e4e4", "#888888", "#222222",
  "#ffa7d1", "#e50000", "#e59500", "#a06a42",
  "#e5d900", "#94e044", "#02be01", "#00d3dd",
  "#0083c7", "#0000ea", "#cf6ee4", "#820080",
];

const WIDTH = 64;
const HEIGHT = 40;
const COOLDOWN_MS = 2500;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function nextMidnightIso(): string {
  const now = new Date();
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0);
  return new Date(next).toISOString();
}

// One hex nibble per cell (16 colors fit in one char) — a 64x40 grid packs
// down to a 2560-char string, cheap to ship on every poll.
function hexGrid(grid: Uint8Array): string {
  let s = "";
  for (let i = 0; i < grid.length; i++) s += grid[i].toString(16);
  return s;
}

// Mounted at bisks.net/the-place/ — strip the mount prefix before routing, so
// the /api/* check and the DO + ASSETS all see root-relative paths (the assets
// dir and the DO have no idea they aren't at the domain root). The client
// prefixes its /api calls and self-links with /the-place (see
// public/index.html's MOUNT const). See notes/40-new-site-playbook.md.
const PREFIX = "/the-place";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    url.pathname = url.pathname.slice(PREFIX.length) || "/";
    const stripped = new Request(url, request);
    if (url.pathname.startsWith("/api/")) {
      const id = env.CANVAS.idFromName("global");
      const stub = env.CANVAS.get(id);
      return stub.fetch(stripped);
    }
    return env.ASSETS.fetch(stripped);
  },
};

export class Canvas {
  private state: DurableObjectState;
  private grid: Uint8Array = new Uint8Array(WIDTH * HEIGHT);
  private day = "";
  private version = 0;
  private pixelsToday = 0;
  private archiveDays: string[] = [];
  private lastByIp = new Map<string, number>();
  private ready: Promise<void>;

  constructor(state: DurableObjectState) {
    this.state = state;
    this.ready = this.state.blockConcurrencyWhile(async () => {
      const [day, grid, version, pixelsToday, archiveDays] = await Promise.all([
        this.state.storage.get<string>("day"),
        this.state.storage.get<Uint8Array>("grid"),
        this.state.storage.get<number>("version"),
        this.state.storage.get<number>("pixelsToday"),
        this.state.storage.get<string[]>("archiveDays"),
      ]);
      this.day = day ?? "";
      this.grid = grid ? new Uint8Array(grid) : new Uint8Array(WIDTH * HEIGHT);
      this.version = version ?? 0;
      this.pixelsToday = pixelsToday ?? 0;
      this.archiveDays = archiveDays ?? [];
    });
  }

  private async ensureDay(): Promise<void> {
    const today = todayStr();
    if (this.day === today) return;
    if (this.day) {
      // Freeze the finished day before wiping the live grid.
      await this.state.storage.put(`archive:${this.day}`, this.grid);
      if (!this.archiveDays.includes(this.day)) {
        this.archiveDays = [this.day, ...this.archiveDays].slice(0, 365);
      }
    }
    this.day = today;
    this.grid = new Uint8Array(WIDTH * HEIGHT);
    this.pixelsToday = 0;
    this.version++;
    this.lastByIp.clear();
    await this.state.storage.put({
      day: this.day,
      grid: this.grid,
      version: this.version,
      pixelsToday: this.pixelsToday,
      archiveDays: this.archiveDays,
    });
  }

  async fetch(request: Request): Promise<Response> {
    await this.ready;
    await this.ensureDay();
    const url = new URL(request.url);

    if (url.pathname === "/api/state" && request.method === "GET") {
      return this.handleState(url);
    }
    if (url.pathname === "/api/pixel" && request.method === "POST") {
      return this.handlePixel(request);
    }
    if (url.pathname === "/api/days" && request.method === "GET") {
      return json({ today: this.day, days: this.archiveDays });
    }
    return json({ error: "not found" }, 404);
  }

  private async handleState(url: URL): Promise<Response> {
    const dayParam = url.searchParams.get("day");
    if (!dayParam || dayParam === this.day) {
      return json({
        day: this.day,
        width: WIDTH,
        height: HEIGHT,
        palette: PALETTE,
        grid: hexGrid(this.grid),
        version: this.version,
        pixelsToday: this.pixelsToday,
        resetAt: nextMidnightIso(),
        cooldownMs: COOLDOWN_MS,
        live: true,
      });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dayParam) || dayParam > this.day) {
      return json({ error: "bad day" }, 400);
    }
    const archived = await this.state.storage.get<Uint8Array>(`archive:${dayParam}`);
    if (!archived) return json({ error: "no archive for that day" }, 404);
    return json({
      day: dayParam,
      width: WIDTH,
      height: HEIGHT,
      palette: PALETTE,
      grid: hexGrid(new Uint8Array(archived)),
      live: false,
    });
  }

  private async handlePixel(request: Request): Promise<Response> {
    const ip = request.headers.get("cf-connecting-ip") || "anon";
    const now = Date.now();
    const last = this.lastByIp.get(ip) ?? 0;
    const wait = COOLDOWN_MS - (now - last);
    if (wait > 0) return json({ error: "cooldown", retryMs: wait }, 429);

    let body: { x?: unknown; y?: unknown; c?: unknown };
    try {
      body = await request.json();
    } catch {
      return json({ error: "bad json" }, 400);
    }
    const { x, y, c } = body;
    if (
      !Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(c) ||
      (x as number) < 0 || (x as number) >= WIDTH ||
      (y as number) < 0 || (y as number) >= HEIGHT ||
      (c as number) < 0 || (c as number) >= PALETTE.length
    ) {
      return json({ error: "bad pixel" }, 400);
    }

    this.grid[(y as number) * WIDTH + (x as number)] = c as number;
    this.pixelsToday++;
    this.version++;
    this.lastByIp.set(ip, now);
    await this.state.storage.put({
      grid: this.grid,
      pixelsToday: this.pixelsToday,
      version: this.version,
    });

    return json({
      ok: true,
      version: this.version,
      pixelsToday: this.pixelsToday,
      cooldownMs: COOLDOWN_MS,
    });
  }
}
