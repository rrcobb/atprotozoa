// shelfguessr Worker — served at the root of shelfguessr.bisks.net.
// Every game write (a shelf photo, a guess) is a plain atproto record the
// browser signs and writes to the *writer's own* PDS; the leaderboard and
// the cluster-filtered shelf pool are both computed client-side by replaying
// those records network-wide (public/lib/global-index.js). This Worker never
// holds game state — it's a static-asset passthrough.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
