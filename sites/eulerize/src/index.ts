// Served at the root of eulerize.bisks.net. Everything runs client-side
// (upload an image, trace the graph, run Hierholzer's algorithm in-browser),
// so the Worker's only job is to hand requests to the static-asset router.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
