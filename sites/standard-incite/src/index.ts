// Served at the root of standard-incite.bisks.net, so requests are passed to
// the static-asset router unchanged. No server-side surface — the mutuals
// walk and every PDS read happen client-side (public/lib/*.js).
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
