// hivemind Worker — hivemind.bisks.net.
//
// A virtual hive: feed and care for a digital bee that grows stronger and
// smarter by solving math problems and learning new words. The bee itself
// is entirely client-side state (public/app.js, localStorage) — no login,
// no per-user server record. The one thing that needs a server is making
// "the swarm" real: a single global Durable Object ("global", same shape as
// sites/quotehof's tracker) holds a leaderboard of every bee that's been
// submitted, keyed by a random per-browser clientId so re-submitting just
// updates your own row instead of spamming duplicates.

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
}
interface DurableObjectState {
  storage: DurableObjectStorage;
  blockConcurrencyWhile<T>(fn: () => Promise<T>): Promise<T>;
}

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
  HIVE: DurableObjectNamespace;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      const stub = env.HIVE.get(env.HIVE.idFromName("global"));
      return stub.fetch(request);
    }
    return env.ASSETS.fetch(request);
  },
};

// ---- Hive Durable Object ---------------------------------------------------

interface BeeEntry {
  clientId: string;
  name: string;
  level: number;
  xp: number;
  wordsLearned: number;
  mathSolved: number;
  streak: number;
  updatedAt: number;
}

const MAX_BOARD = 100;
const MAX_NAME = 40;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "access-control-allow-origin": "*" },
  });
}

function str(v: unknown, max: number): string {
  return typeof v === "string" ? v.slice(0, max) : "";
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}

// A bland default so an empty/garbage name still shows up as *a* bee, not a
// broken row.
function cleanName(v: unknown): string {
  const s = str(v, MAX_NAME).trim();
  return s || "an unnamed bee";
}

export class Hive {
  private state: DurableObjectState;
  private ready: Promise<void>;
  private bees: Map<string, BeeEntry> = new Map();
  private totalSubmits = 0;

  constructor(state: DurableObjectState) {
    this.state = state;
    this.ready = this.state.blockConcurrencyWhile(async () => {
      const [bees, totalSubmits] = await Promise.all([
        this.state.storage.get<BeeEntry[]>("bees"),
        this.state.storage.get<number>("totalSubmits"),
      ]);
      for (const b of bees ?? []) this.bees.set(b.clientId, b);
      this.totalSubmits = totalSubmits ?? 0;
    });
  }

  private board(): BeeEntry[] {
    return [...this.bees.values()]
      .sort((a, b) => b.xp - a.xp || b.level - a.level)
      .slice(0, MAX_BOARD);
  }

  private async persist(): Promise<void> {
    // Storage only ever needs to hold what the board can show, plus a little
    // slack so a bee that just fell off the visible top-100 isn't lost the
    // instant someone else edges past it.
    const trimmed = [...this.bees.values()]
      .sort((a, b) => b.xp - a.xp || b.level - a.level)
      .slice(0, MAX_BOARD * 2);
    this.bees = new Map(trimmed.map((b) => [b.clientId, b]));
    await this.state.storage.put({ bees: trimmed, totalSubmits: this.totalSubmits });
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

    if (url.pathname === "/api/leaderboard" && request.method === "GET") {
      return json({ board: this.board(), hiveSize: this.bees.size, totalSubmits: this.totalSubmits });
    }

    if (url.pathname === "/api/submit" && request.method === "POST") {
      const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
      if (!body) return json({ error: "bad body" }, 400);
      const clientId = str(body.clientId, 64);
      if (!clientId) return json({ error: "missing clientId" }, 400);

      const entry: BeeEntry = {
        clientId,
        name: cleanName(body.name),
        level: num(body.level),
        xp: num(body.xp),
        wordsLearned: num(body.wordsLearned),
        mathSolved: num(body.mathSolved),
        streak: num(body.streak),
        updatedAt: Date.now(),
      };
      const existing = this.bees.get(clientId);
      if (!existing) this.totalSubmits++;
      this.bees.set(clientId, entry);
      await this.persist();

      const board = this.board();
      const rank = board.findIndex((b) => b.clientId === clientId);
      return json({ ok: true, rank: rank === -1 ? null : rank + 1, board, hiveSize: this.bees.size });
    }

    return json({ error: "not found" }, 404);
  }
}
