// Served at the root of pigger.bisks.net, so requests are passed to the
// static-asset router unchanged. Everything the game needs lives in
// public/ — no server-side behavior.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
