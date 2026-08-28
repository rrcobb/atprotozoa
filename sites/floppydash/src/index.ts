// Served at the root of floppydash.bisks.net, so requests pass straight to
// the static-asset router. The whole game is client-side (see public/game.js).
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
