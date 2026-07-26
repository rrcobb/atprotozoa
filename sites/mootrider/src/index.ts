// mootrider Worker — the game itself is all client (public/game.js). The
// only server surface is a global top-scores leaderboard so runs are
// comparable across everyone who's played, not just localStorage-per-browser.
//
// One Durable Object, one instance ("global"), holding the whole leaderboard —
// single writer, no read-modify-write races on concurrent submits. Hand-declared
// DO interfaces, no @cloudflare/workers-types dependency, same shape as
// sites/ratioed/src/index.ts (copy, don't abstract).

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
  LEADERBOARD: DurableObjectNamespace;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      const id = env.LEADERBOARD.idFromName("global");
      const stub = env.LEADERBOARD.get(id);
      return stub.fetch(request);
    }
    return env.ASSETS.fetch(request);
  },
};

// ---- config -----------------------------------------------------------
const LEADERBOARD_SIZE = 200; // kept in storage, one entry per did
const SHOW_TOP = 25; // returned to the client
const MAX_HANDLE_LEN = 253;
const MAX_TEXT_LEN = 64;
const MAX_SCORE = 100_000; // sanity ceiling — not anti-cheat, just guards against garbage payloads
const MAX_METERS = 1_000_000;

interface Entry {
  did: string;
  handle: string;
  displayName: string;
  avatar: string;
  score: number;
  meters: number;
  culprit: string; // handle of whoever ended the run, for flavor
  at: number;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "access-control-allow-origin": "*" },
  });
}

function clean(s: unknown, maxLen: number): string {
  return typeof s === "string" ? s.slice(0, maxLen) : "";
}

export class Leaderboard {
  private state: DurableObjectState;
  private ready: Promise<void>;
  private entries: Entry[] = [];

  constructor(state: DurableObjectState) {
    this.state = state;
    this.ready = this.state.blockConcurrencyWhile(async () => {
      const stored = await this.state.storage.get<Entry[]>("entries");
      this.entries = stored ?? [];
    });
  }

  private resort(): void {
    this.entries.sort((a, b) => b.score - a.score || b.meters - a.meters || a.at - b.at);
    if (this.entries.length > LEADERBOARD_SIZE) this.entries.length = LEADERBOARD_SIZE;
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
      return json({ leaderboard: this.entries.slice(0, SHOW_TOP) });
    }

    if (url.pathname === "/api/score" && request.method === "POST") {
      let body: any;
      try {
        body = await request.json();
      } catch {
        return json({ error: "bad json" }, 400);
      }

      const did = clean(body.did, 128);
      const score = Math.floor(Number(body.score));
      const meters = Math.floor(Number(body.meters));
      if (!did.startsWith("did:") || !Number.isFinite(score) || !Number.isFinite(meters)) {
        return json({ error: "bad payload" }, 400);
      }
      if (score < 0 || score > MAX_SCORE || meters < 0 || meters > MAX_METERS) {
        return json({ error: "out of range" }, 400);
      }

      const entry: Entry = {
        did,
        handle: clean(body.handle, MAX_HANDLE_LEN) || did,
        displayName: clean(body.displayName, MAX_TEXT_LEN),
        avatar: clean(body.avatar, 512),
        score,
        meters,
        culprit: clean(body.culprit, MAX_HANDLE_LEN),
        at: Date.now(),
      };

      const prevIdx = this.entries.findIndex((e) => e.did === did);
      if (prevIdx === -1) {
        this.entries.push(entry);
      } else if (entry.score > this.entries[prevIdx].score) {
        this.entries[prevIdx] = entry;
      } else {
        // not a personal best — still report where they'd rank, don't store it.
        this.resort();
        const rank = this.entries.findIndex((e) => e.did === did) + 1;
        return json({ ok: true, personalBest: false, rank: rank || null, leaderboard: this.entries.slice(0, SHOW_TOP) });
      }

      this.resort();
      await this.state.storage.put({ entries: this.entries });
      const rank = this.entries.findIndex((e) => e.did === did) + 1;
      return json({ ok: true, personalBest: true, rank: rank || null, leaderboard: this.entries.slice(0, SHOW_TOP) });
    }

    return json({ error: "not found" }, 404);
  }
}
