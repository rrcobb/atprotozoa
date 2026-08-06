// Served at the root of newtendo.bisks.net. Everything is static + client
// side (public/index.html reads public/data/games.json), so the Worker is
// just the ASSETS passthrough.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
