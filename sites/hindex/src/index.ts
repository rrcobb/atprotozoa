// hindex Worker — served at the root of hindex.bisks.net.
//
// Pure static site, everything runs in the browser (live mention count via
// the public AppView search, live catalog size via rateyourbuild's data).
// No server-side logic needed.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
