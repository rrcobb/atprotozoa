// skymash Worker: served at the root of skymash.bisks.net, so requests pass
// straight to the static-asset router. Everything else (eligibility checks,
// pairing, votes, the leaderboard) is client-side per the frontend-first house
// rule — nominations and votes are net.bisks.skymash.* records written to
// each voter's own PDS, read back network-wide via listReposByCollection +
// Jetstream (public/lib/global-index.js, same Tier-3 pattern as
// sites/rateyourbuild and sites/quadrants).
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
