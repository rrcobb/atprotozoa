// Served at the root of touchthestove.bisks.net. The whole game runs
// client-side against localStorage, so the Worker's only job is to
// hand requests to the static-asset router.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
