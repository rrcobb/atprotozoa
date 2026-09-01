// Served at the root of bandorinsult.bisks.net, so requests are passed to
// the static-asset router unchanged. No server-side surface — the game is
// entirely client-side (public/index.html + public/data/phrases.js).
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
