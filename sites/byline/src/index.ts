// byline Worker
//
// Served at the root of byline.bisks.net. No server-side logic — every row
// is a static JSON file (public/data/byline.json) generated from the repo's
// own site.json manifests. No shared write path, no beacon, nothing to
// retire later.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
