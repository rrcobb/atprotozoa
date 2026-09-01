// Served at the root of actual.bisks.net, so requests are passed to the
// static-asset router unchanged. No backend needed — every tool here runs
// entirely client-side, which is also why none of it needs a server to be real.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
