// Served at the root of insecollider.bisks.net — a brand-new site, so no
// mount-prefix stripping. Everything lives client-side in public/; the
// Worker just hands requests to the static-asset router.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
