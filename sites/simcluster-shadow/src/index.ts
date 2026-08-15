// Served at the root of simcluster-shadow.bisks.net, so requests are passed
// straight to the static-asset router. Everything — OAuth, posting, moot
// lookup, search — runs client-side; there's no server surface here.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
