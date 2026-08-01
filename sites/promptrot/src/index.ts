// promptrot Worker — promptrot.bisks.net.
//
// Pure static site, no dynamic routes: the whole thing is a client-side text
// transform (public/index.html). Every request falls through to ASSETS.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
