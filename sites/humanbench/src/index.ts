// humanbench Worker — humanbench.bisks.net.
//
// Pure static site: the leaderboard lives in public/data/entries.json, hand-
// appended one result per HumanBENCH submission (see "HumanBENCH leaderboard
// entries" in sites/buildthis/builder/INSTRUCTIONS.md), rendered client-side.
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
