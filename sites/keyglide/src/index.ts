// Served at the root of keyglide.bisks.net. Everything runs client-side (see
// public/index.html) — no OAuth, no KV, no per-result server route. Just
// forward to the static-asset router.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
