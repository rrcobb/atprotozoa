// quotebucket Worker — served at the root of quotebucket.bisks.net. Pure
// static site (everything lives in public/ and talks to Bluesky's public
// AppView straight from the browser), so the only job here is handing every
// request to the static-asset router. No mount-prefix stripping needed —
// this is a brand-new site, not a path-mounted legacy one.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
