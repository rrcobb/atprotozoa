// Served at the root of obelisk.bisks.net, so requests are passed straight
// through to the static-asset router. No server-side surface — the whole
// thing is a static page with a client-side flame/twinkle animation.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
