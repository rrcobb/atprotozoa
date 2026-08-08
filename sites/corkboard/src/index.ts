// Served at the root of corkboard.bisks.net, so requests are passed to the
// static-asset router unchanged. No server-side behavior — the board lives
// entirely client-side (localStorage + a shareable ?c= link).
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
