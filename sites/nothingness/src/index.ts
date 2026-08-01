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
}
interface DurableObjectState {
  storage: DurableObjectStorage;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api/nothing") {
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

// Holds exactly two numbers: an all-time total and today's count, keyed by
// epoch day so "today" resets itself with no alarm or cron needed — the
// next request after midnight just starts a fresh key.
export class Void {
  private state: DurableObjectState;

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    const day = Math.floor(Date.now() / DAY_MS);
    const dayKey = `day:${day}`;

    if (request.method === "POST") {
      const [total, todayCount] = await Promise.all([
        this.state.storage.get<number>("total"),
        this.state.storage.get<number>(dayKey),
      ]);
      const nextTotal = (total ?? 0) + 1;
      const nextToday = (todayCount ?? 0) + 1;
      await this.state.storage.put({ total: nextTotal, [dayKey]: nextToday });
      return json({ total: nextTotal, today: nextToday });
    }

    const [total, todayCount] = await Promise.all([
      this.state.storage.get<number>("total"),
      this.state.storage.get<number>(dayKey),
    ]);
    return json({ total: total ?? 0, today: todayCount ?? 0 });
  }
}
