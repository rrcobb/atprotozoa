// trigruessr Worker — trigruessr.bisks.net
//
// The guessing game (see public/index.html) is still pure client-side: it
// reads Bluesky's public AppView directly from the browser, no server
// involved. The only thing this Worker adds is /api/net, backing a single
// hidden, unpublicized "first click wins" claim somewhere on the page — a
// Durable Object gives us the one thing localStorage can't: a single global
// answer to "has anyone already claimed this," consistent no matter who asks
// or from where.

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
  NET: DurableObjectNamespace;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api/net") {
      const id = env.NET.idFromName("global");
      const stub = env.NET.get(id);
      return stub.fetch(request);
    }
    return env.ASSETS.fetch(request);
  },
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

interface WinnerState {
  handle: string;
  claimedAt: number;
}

// Loose atproto handle shape (no cross-worker DNS/DID resolution here — this
// isn't verifying the claim, just keeping obvious junk out).
const HANDLE_RE = /^[a-zA-Z0-9](?:[a-zA-Z0-9.-]{0,251}[a-zA-Z0-9])?$/;

export class NetWinner {
  private state: DurableObjectState;
  private ready: Promise<void>;
  private winner: WinnerState | null = null;

  constructor(state: DurableObjectState) {
    this.state = state;
    this.ready = this.state.blockConcurrencyWhile(async () => {
      this.winner = (await this.state.storage.get<WinnerState>("winner")) ?? null;
    });
  }

  async fetch(request: Request): Promise<Response> {
    await this.ready;

    if (request.method === "GET") {
      return json(
        this.winner
          ? { claimed: true, handle: this.winner.handle }
          : { claimed: false },
      );
    }

    if (request.method === "POST") {
      if (this.winner) {
        return json({ claimed: true, handle: this.winner.handle, first: false });
      }

      let body: any = {};
      try {
        body = await request.json();
      } catch {
        return json({ error: "bad json" }, 400);
      }

      const handle =
        typeof body.handle === "string" ? body.handle.trim().replace(/^@/, "") : "";
      if (!HANDLE_RE.test(handle)) {
        return json({ error: "that doesn't look like a handle" }, 400);
      }

      // A Durable Object processes one request's JS at a time (input gates
      // hold off the next request during the storage round-trip above and
      // below), so this check-then-set can't race with another claim.
      this.winner = { handle, claimedAt: Date.now() };
      await this.state.storage.put({ winner: this.winner });
      return json({ claimed: true, handle, first: true });
    }

    return json({ error: "not found" }, 404);
  }
}
