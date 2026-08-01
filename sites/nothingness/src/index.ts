// nothingness Worker — nothingness.bisks.net
//
// @fromthewestmeadow.com asked for a site that "really demonstrates the
// concept of nothingness." The homepage is a void: near-blank, low-contrast,
// nothing to click for the first several seconds. Witnessing it takes real,
// active attention — click the nothing at least once every five seconds or
// the streak lapses — and that streak length is the whole game, backed by an
// actual Durable Object.
//
// A leaderboard for "longest witnessed" sits on top of that same object:
// sign in with Bluesky (public-client atproto OAuth, browser-side — see
// public/lib/oauth.js) and your best streak attributes to your DID instead
// of staying local. Originally had a "generate nothing" click counter too,
// but @fromthewestmeadow.com asked for the leaderboard to track witness time
// instead and for the button to go — so the whole site is now just the
// witnessing mechanic, for real distributed infrastructure in service of
// absolutely nothing.
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
    if (url.pathname === "/api/witness" || url.pathname === "/api/leaderboard") {
      const id = env.VOID.idFromName("global");
      const stub = env.VOID.get(id);
      return stub.fetch(request);
    }
    return env.ASSETS.fetch(request);
  },
};

function json(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    headers: { "content-type": "application/json", "access-control-allow-origin": "*" },
  });
}

interface UserRecord {
  handle: string;
  best: number;
}

const LEADERBOARD_SIZE = 50;
const MAX_SECONDS = 60 * 60 * 24; // a day of uninterrupted witnessing is generous enough

// Holds the global session/second tallies, plus one UserRecord per
// signed-in DID that's ever finished a witness streak, under a
// "user:<did>" key. The leaderboard is that user set, sorted by best streak
// on read — nobody's expecting sub-millisecond reads out of a site whose
// entire purpose is timing how long someone stared at nothing.
export class Void {
  private state: DurableObjectState;

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/leaderboard") {
      const [sessions, totalSeconds, users] = await Promise.all([
        this.state.storage.get<number>("sessions"),
        this.state.storage.get<number>("totalSeconds"),
        this.state.storage.list<UserRecord>({ prefix: "user:" }),
      ]);
      const leaders = [...users.entries()]
        .map(([key, rec]) => ({ did: key.slice("user:".length), handle: rec.handle, best: rec.best }))
        .sort((a, b) => b.best - a.best)
        .slice(0, LEADERBOARD_SIZE);
      return json({ sessions: sessions ?? 0, totalSeconds: totalSeconds ?? 0, leaders });
    }

    if (url.pathname === "/api/witness" && request.method === "POST") {
      let did: string | null = null;
      let handle = "";
      let seconds = 0;
      try {
        const body = (await request.json()) as { did?: string; handle?: string; seconds?: number };
        if (typeof body?.did === "string" && body.did.startsWith("did:")) {
          did = body.did;
          handle = typeof body.handle === "string" && body.handle ? body.handle : body.did;
        }
        if (typeof body?.seconds === "number" && Number.isFinite(body.seconds) && body.seconds > 0) {
          seconds = Math.min(Math.floor(body.seconds), MAX_SECONDS);
        }
      } catch {
        // no/invalid body — nothing to record.
      }

      if (!did || seconds <= 0) return json({ error: "nothing to witness" });

      const userKey = `user:${did}`;
      const [sessions, totalSeconds, existingUser] = await Promise.all([
        this.state.storage.get<number>("sessions"),
        this.state.storage.get<number>("totalSeconds"),
        this.state.storage.get<UserRecord>(userKey),
      ]);
      const nextSessions = (sessions ?? 0) + 1;
      const nextTotalSeconds = (totalSeconds ?? 0) + seconds;
      const personalBest = Math.max(existingUser?.best ?? 0, seconds);

      await this.state.storage.put({
        sessions: nextSessions,
        totalSeconds: nextTotalSeconds,
        [userKey]: { handle, best: personalBest } satisfies UserRecord,
      });
      return json({ personalBest, sessions: nextSessions, totalSeconds: nextTotalSeconds });
    }

    return json({ error: "not found" });
  }
}
