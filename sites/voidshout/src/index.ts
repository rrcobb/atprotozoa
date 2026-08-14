// Served at the root of voidshout.bisks.net — OAuth is a public client
// running entirely in the browser (public/lib/oauth.js), and Jetstream
// ingestion happens client-side too, so no server surface is needed. Every
// request falls through to the static assets.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
