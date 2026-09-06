// mootvent — served at the root of mootvent.bisks.net. Everything real
// happens client-side (public/index.html): 24 doors, one gift each, opened
// on schedule and remembered in localStorage. No server state of its own.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
