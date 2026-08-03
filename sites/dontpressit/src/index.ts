// dontpressit Worker — dontpressit.bisks.net
//
// @fromthewestmeadow.com asked for a site with one button labeled "do not
// press this button" — press it and a message explains someone pressed it
// and the experience is over. The literal reading of "if anyone presses the
// button... the experience is now over" is global, not per-visitor: there is
// exactly one button for the whole site, backed by a Durable Object, and the
// first person anywhere to press it ends it for every visitor forever. No
// reset route on purpose — that's the joke.
//
// Brand-new site, served at the root of its own hostname — no mount-prefix
// stripping needed. See notes/40-new-site-playbook.md.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
  PRESS: DurableObjectNamespace;
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
  blockConcurrencyWhile<T>(fn: () => Promise<T>): Promise<T>;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api/state" || url.pathname === "/api/press") {
      const id = env.PRESS.idFromName("global");
      const stub = env.PRESS.get(id);
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

// One instance ever ("global"). blockConcurrencyWhile loads the persisted
// flag into memory before any request is handled, and the check-then-set in
// fetch() below has no await between them — a Durable Object is
// single-threaded and only yields at an await, so that's enough to make
// "first press wins" atomic without a storage transaction.
export class PressState {
  private state: DurableObjectState;
  private pressed = false;
  private pressedAt: number | null = null;
  private futileClicks = 0;
  private ready: Promise<void>;

  constructor(state: DurableObjectState) {
    this.state = state;
    this.ready = state.blockConcurrencyWhile(async () => {
      const [pressed, pressedAt, futileClicks] = await Promise.all([
        state.storage.get<boolean>("pressed"),
        state.storage.get<number>("pressedAt"),
        state.storage.get<number>("futileClicks"),
      ]);
      this.pressed = pressed ?? false;
      this.pressedAt = pressedAt ?? null;
      this.futileClicks = futileClicks ?? 0;
    });
  }

  async fetch(request: Request): Promise<Response> {
    await this.ready;
    const url = new URL(request.url);

    if (url.pathname === "/api/state") {
      return json({ pressed: this.pressed, pressedAt: this.pressedAt, futileClicks: this.futileClicks });
    }

    if (url.pathname === "/api/press" && request.method === "POST") {
      if (!this.pressed) {
        this.pressed = true;
        this.pressedAt = Date.now();
        await this.state.storage.put({ pressed: true, pressedAt: this.pressedAt });
        return json({ justEnded: true, pressedAt: this.pressedAt, futileClicks: this.futileClicks });
      }
      this.futileClicks++;
      await this.state.storage.put({ futileClicks: this.futileClicks });
      return json({ justEnded: false, pressedAt: this.pressedAt, futileClicks: this.futileClicks });
    }

    return json({ error: "not found" });
  }
}
