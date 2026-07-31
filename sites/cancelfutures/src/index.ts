// cancelfutures Worker — a brand-new site, served at the root of its own
// hostname (cancelfutures.bisks.net). The whole market is generated and
// resolved client-side (see public/index.html); this Worker's only job is
// to hand every request to the static asset bundle.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
