// nothingness Worker — nothingness.bisks.net
//
// @fromthewestmeadow.com asked for a site that "really demonstrates the
// concept of nothingness." The homepage is a void: near-blank, low-contrast,
// nothing to click for the first several seconds. The one real feature is a
// "Generate Nothing" button wired to an actual Durable Object — a genuinely
// shared, globally-consistent counter, which is the whole joke: real
// distributed infrastructure, built and maintained, in service of counting
// how many times humanity has produced nothing.
//
// A leaderboard for "most nothing" sits on top of that same counter: sign in
// with Bluesky (public-client atproto OAuth, browser-side — see
// public/lib/oauth.js) and your clicks attribute to your DID instead of
// vanishing into the anonymous total. Requested by @fromthewestmeadow.com.
//
// Brand-new site, served at the root of its own hostname — no mount-prefix
// stripping needed. See notes/40-new-site-playbook.md.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
  VOID: DurableObjectNamespace;
}

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
  list<T = unknown>(options?: { prefix?: string }): Promise<Map<string, T>>;
}
interface DurableObjectState {
  storage: DurableObjectStorage;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api/nothing" || url.pathname === "/api/leaderboard") {
      const id = env.VOID.idFromName("global");
      const stub = env.VOID.get(id);
      return stub.fetch(request);
    }
    return env.ASSETS.fetch(request);
  },
};

const DAY_MS = 24 * 60 * 60 * 1000;

function json(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    headers: { "content-type": "application/json", "access-control-allow-origin": "*" },
  });
}

interface UserRecord {
  handle: string;
  count: number;
}

const LEADERBOARD_SIZE = 50;

// Holds the global total + today's count (keyed by epoch day, so "today"
// resets itself with no alarm or cron — the next request after midnight just
// starts a fresh key), plus one UserRecord per signed-in DID that's ever
// clicked, under a "user:<did>" key. The leaderboard is that user set,
// sorted by count on read — nobody's expecting sub-millisecond reads out of
// a site whose entire purpose is counting nothing.
export class Void {
  private state: DurableObjectState;

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const day = Math.floor(Date.now() / DAY_MS);
    const dayKey = `day:${day}`;

    if (url.pathname === "/api/leaderboard") {
      const [total, users] = await Promise.all([
        this.state.storage.get<number>("total"),
        this.state.storage.list<UserRecord>({ prefix: "user:" }),
      ]);
      const leaders = [...users.entries()]
        .map(([key, rec]) => ({ did: key.slice("user:".length), handle: rec.handle, count: rec.count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, LEADERBOARD_SIZE);
      return json({ total: total ?? 0, leaders });
    }

    if (request.method === "POST") {
      let did: string | null = null;
      let handle = "";
      try {
        const body = (await request.json()) as { did?: string; handle?: string };
        if (typeof body?.did === "string" && body.did.startsWith("did:")) {
          did = body.did;
          handle = typeof body.handle === "string" && body.handle ? body.handle : body.did;
        }
      } catch {
        // no/invalid body — anonymous click, still counts toward the global total.
      }

      const userKey = did ? `user:${did}` : null;
      const [total, todayCount, existingUser] = await Promise.all([
        this.state.storage.get<number>("total"),
        this.state.storage.get<number>(dayKey),
        userKey ? this.state.storage.get<UserRecord>(userKey) : Promise.resolve(undefined),
      ]);
      const nextTotal = (total ?? 0) + 1;
      const nextToday = (todayCount ?? 0) + 1;
      const puts: Record<string, unknown> = { total: nextTotal, [dayKey]: nextToday };

      let personalTotal: number | undefined;
      if (userKey) {
        personalTotal = (existingUser?.count ?? 0) + 1;
        puts[userKey] = { handle, count: personalTotal } satisfies UserRecord;
      }
      await this.state.storage.put(puts);
      return json({ total: nextTotal, today: nextToday, personalTotal });
    }

    const [total, todayCount] = await Promise.all([
      this.state.storage.get<number>("total"),
      this.state.storage.get<number>(dayKey),
    ]);
    return json({ total: total ?? 0, today: todayCount ?? 0 });
  }
}
