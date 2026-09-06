// Served at the root of fleetswipe.bisks.net. The whole deck is static
// (public/index.html + public/app.js) — no server-side behavior needed.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
