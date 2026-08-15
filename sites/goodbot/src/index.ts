// goodbot Worker
//
// Served at the root of goodbot.bisks.net. No server-side logic at all —
// the treat counter lives in localStorage and every animation runs
// client-side.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
