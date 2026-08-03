// Served at the root of onlygodoglyness.bisks.net. Everything here runs
// client-side against the public AppView (see public/app.js) — the Worker
// just forwards to the static-asset router.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
