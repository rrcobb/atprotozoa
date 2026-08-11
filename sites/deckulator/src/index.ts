// deckulator Worker — served at the root of deckulator.bisks.net. The whole
// calculator runs client-side against user-entered dimensions (no atproto
// per-user data to compute server-side), so the Worker's only job is to hand
// requests to the static-asset router.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
