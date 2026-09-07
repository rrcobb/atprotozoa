// Served at the root of fleetwatch.bisks.net. The whole board is static
// (public/index.html + public/app.js) — no server-side behavior needed.
// All the actual pinging happens client-side, straight from the visitor's
// browser to each site's own subdomain.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
