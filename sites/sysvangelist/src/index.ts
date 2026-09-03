// sysvangelist Worker — sysvangelist.bisks.net
//
// @7778777.online asked for a site agitating omarchy users to petition Arch
// Linux to drop systemd and Wayland for sysvinit and Xlibre. This is that
// petition: a manifesto, a "lineage" checker, and a shared signature count.
//
// The signature count and signer wall live in KV, best-effort, same shape as
// sites/dontpressit's shared round counter — not a Durable Object (banned in
// this repo, notes/11-durable-objects.md). A lost signature under concurrent
// writes is an acceptable trade for not running a coordinator.

interface KVNamespace {
  get<T = unknown>(key: string, type: "json"): Promise<T | null>;
  put(key: string, value: string): Promise<void>;
}

export interface Env {
  ASSETS: { fetch: (request: Request) => Promise<Response> };
  PETITION_STATE: KVNamespace;
}

interface Signer {
  handle: string;
  signedAt: number;
}

interface PetitionState {
  count: number;
  signers: Signer[];
}

const STATE_KEY = "petition";
// Enough for the visible wall; the count itself is unbounded.
const SIGNERS_MAX = 40;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
    },
  });
}

function freshState(): PetitionState {
  return { count: 0, signers: [] };
}

async function readState(env: Env): Promise<PetitionState> {
  const stored = await env.PETITION_STATE.get<PetitionState>(STATE_KEY, "json");
  return stored ?? freshState();
}

async function writeState(env: Env, state: PetitionState): Promise<void> {
  await env.PETITION_STATE.put(STATE_KEY, JSON.stringify(state));
}

function normalizeHandle(raw: unknown): string {
  const s = String(raw || "").trim().replace(/^@/, "").slice(0, 200);
  return s || "an anonymous purist";
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/state" && request.method === "GET") {
      return json(await readState(env));
    }

    if (url.pathname === "/api/sign" && request.method === "POST") {
      const body = await request.json<Partial<Signer>>().catch(() => ({}) as Partial<Signer>);
      const state = await readState(env);
      const signer: Signer = { handle: normalizeHandle(body.handle), signedAt: Date.now() };
      state.count += 1;
      state.signers = [signer, ...state.signers].slice(0, SIGNERS_MAX);
      await writeState(env, state);
      return json(state);
    }

    return env.ASSETS.fetch(request);
  },
};
