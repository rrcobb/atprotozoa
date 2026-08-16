// Served at the root of gonefishin.bisks.net, so requests are passed to the
// static-asset router unchanged. The whole game runs client-side in
// public/app.js against the public AppView; there's no server surface here.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
