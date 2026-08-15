// Served at the root of skullcouncil.bisks.net, so requests are passed to the
// static-asset router unchanged. Everything skullcouncil does (reading the
// public feed, signing in, posting a reply) happens client-side.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
