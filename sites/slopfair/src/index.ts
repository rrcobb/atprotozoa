// Served at the root of slopfair.bisks.net. Pure static exhibition hall — no
// server logic, no OAuth, no KV. Requests pass straight to the static-asset
// router.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
