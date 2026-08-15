// Served at the root of acid100.bisks.net — pure static site, no server
// logic beyond the ASSETS fallthrough.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
