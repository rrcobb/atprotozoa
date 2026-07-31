// meadowfolio Worker — meadowfolio.bisks.net.
//
// Pure static site, no dynamic routes: every request falls through to the
// ASSETS binding. The gallery reads the public AppView anonymously in the
// browser (public/lib/feed.js); releases and curator picks are baked into
// public/data.js at build time.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
