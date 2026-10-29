// Served at the root of primordial-feed.bisks.net — pure static site. The whole
// ecology runs in the visitor's browser.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
