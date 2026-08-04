// rantwalk Worker — served at the root of rantwalk.bisks.net.
// The whole game runs client-side against the baked public/data/graph.json,
// so the Worker's only job is the usual static-asset fallthrough.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
