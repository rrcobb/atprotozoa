// Served at the root of followteroids.bisks.net — pure static site, no
// server-side logic. Everything (follows/profile fetch, gameplay, rendering)
// happens client-side against Bluesky's public AppView.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
