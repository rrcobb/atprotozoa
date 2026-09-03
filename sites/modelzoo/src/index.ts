// Served at the root of modelzoo.bisks.net. The whole game runs client-side
// in public/index.html (turn state, tech tree, RNG) — nothing here needs a
// server, so this is a straight passthrough to the static-asset router.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
