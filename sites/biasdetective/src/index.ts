// biasdetective Worker — biasdetective.bisks.net
//
// Everything lives client-side in public/index.html (the cases, the
// scoring, the share-card canvas). Served at the root of its own
// hostname, so requests just fall through to the static-asset router.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
