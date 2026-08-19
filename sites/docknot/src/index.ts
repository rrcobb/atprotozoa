// Served at the root of docknot.bisks.net. Everything runs client-side in
// public/ — no server surface, which is the whole point of the site.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
