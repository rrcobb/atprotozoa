// alignment-autopsies Worker
//
// Served at the root of alignment-autopsies.bisks.net. No server-side logic —
// the case log itself is a static JSON file (public/data/entries.json) that
// later build runs append to directly, same pattern as sites/sidenote.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
