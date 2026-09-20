// Served at the root of barbcourt.bisks.net. The whole game runs client-side
// (localStorage for standing, the visitor's own key for the optional real
// judge) so there's nothing for the Worker to do but hand back static assets.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
