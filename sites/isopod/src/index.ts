// isopod Worker
//
// Served at the root of isopod.bisks.net. No server-side logic — the whole
// page is static; the leaderboard is built client-side from a live Bluesky
// search (see public/lib/bsky.js).
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
