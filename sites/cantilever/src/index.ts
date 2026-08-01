// cantilever.bisks.net — a brand-new site, served at the root of its own
// hostname. No mount-prefix stripping needed; just forward to ASSETS.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
