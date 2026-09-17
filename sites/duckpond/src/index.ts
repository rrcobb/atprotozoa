// duckpond Worker — duckpond.bisks.net. Brand-new site served at the root of
// its own hostname, so no mount-prefix stripping — just forward to the static
// asset binding.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
