// Served at the root of peemyplants.bisks.net — static shell only, no server
// surface. The "map" is entirely client-side (fake seed pins + localStorage),
// on purpose: see public/index.html for why.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
