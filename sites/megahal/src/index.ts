// Served at the root of megahal.bisks.net. The whole thing runs client-side
// (the Markov brains are trained and walked in the browser), so the Worker
// just forwards to the static-asset router.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
