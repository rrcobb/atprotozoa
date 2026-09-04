// tormentnexus Worker — tormentnexus.bisks.net
//
// A machine that is stuck at 73% forever. Every switch, dial, and lever on
// the page is a decoy — flavor text only, wired to nothing. There are only
// two real actions: "complete the nexus" (refuses, every time) and "lock the
// door" (real — bumps a shared, best-effort counter in KV). See
// wrangler.toml for the thread this came out of.
//
// KV, not a Durable Object (banned in this repo, notes/11-durable-objects.md)
// — a lost increment under concurrent writes is an acceptable trade for not
// running a coordinator.

interface KVNamespace {
  get<T = unknown>(key: string, type: "json"): Promise<T | null>;
  put(key: string, value: string): Promise<void>;
}

export interface Env {
  ASSETS: { fetch: (request: Request) => Promise<Response> };
  LOCK_STATE: KVNamespace;
}

interface LockState {
  count: number;
}

const STATE_KEY = "locks";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
    },
  });
}

async function readState(env: Env): Promise<LockState> {
  const stored = await env.LOCK_STATE.get<LockState>(STATE_KEY, "json");
  return stored ?? { count: 0 };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/state" && request.method === "GET") {
      return json(await readState(env));
    }

    if (url.pathname === "/api/lock" && request.method === "POST") {
      const state = await readState(env);
      state.count += 1;
      await env.LOCK_STATE.put(STATE_KEY, JSON.stringify(state));
      return json(state);
    }

    return env.ASSETS.fetch(request);
  },
};
