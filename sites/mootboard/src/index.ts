// Served at the root of mootboard.bisks.net, so requests are passed to the
// static-asset router unchanged. No server-side behavior — the board lives
// entirely client-side (public AppView reads + a shareable ?u=&s= link).
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
