// Served at the root of simcluster-search.bisks.net. Everything runs
// client-side (graph crawl + searchPosts are both browser fetches against the
// public AppView), so the Worker only needs to hand back static assets.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
