// Served at the root of cloudchamber.bisks.net, so requests pass straight to
// the static-asset router. Everything — the Jetstream connection, particle
// classification, and the vapor-trail sim — runs client-side in public/.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
