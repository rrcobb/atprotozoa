// everythingapp Worker — everythingapp.bisks.net.
//
// Pure static site, no dynamic routes: the whole feed is client-side theater
// (public/index.html) generating posts on load. Every request falls through
// to ASSETS.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
