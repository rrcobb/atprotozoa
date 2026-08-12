// unpalatable Worker — unpalatable.bisks.net.
//
// Pure static site: the leaderboard is baked into public/data/scores.json by
// scan.mjs (run by hand, re-run after new sites ship) and rendered client-side.
// No dynamic routes, no per-request compute. Every request falls through to
// ASSETS.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
