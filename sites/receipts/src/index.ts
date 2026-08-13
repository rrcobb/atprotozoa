// receipts Worker
//
// Served at the root of receipts.bisks.net. No server-side logic — every ask
// is a static JSON file (public/data/asks.json) generated from the repo's own
// site.json manifests.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
