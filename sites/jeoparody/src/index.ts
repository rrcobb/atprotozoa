// Served at the root of jeoparody.bisks.net. Everything runs client-side
// (reads the public AppView, anonymously) so there's nothing for the Worker
// to do but hand back static assets.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
