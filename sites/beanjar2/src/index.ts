// beanjar2 Worker — pure static site served at the root of its own
// subdomain (beanjar2.bisks.net). No mount-prefix stripping needed; just
// forward straight to the ASSETS binding.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
