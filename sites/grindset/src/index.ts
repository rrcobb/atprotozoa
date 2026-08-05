// grindset Worker — grindset.bisks.net.
//
// Pure static site, no dynamic routes: the whole "course funnel" is a
// client-side theater piece (public/index.html). Every request falls
// through to ASSETS.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
