// yetihunt Worker — served at the root of yetihunt.bisks.net, so requests
// pass straight to the static-asset router. No server-side game logic; the
// run lives entirely in public/game.js.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
