// meadowbrand Worker — meadowbrand.bisks.net.
//
// Pure static site, no dynamic routes: every request falls through to the
// ASSETS binding. The whole page is baked at build time from
// public/data/brand.json (see build-brand.js) — nothing is computed
// per-request.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
