// freezerboxd Worker
// Served at the root of freezerboxd.bisks.net — everything is a static
// asset, no server-side logic needed.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
