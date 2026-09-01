// Served at the root of unmooted.bisks.net, so requests are passed to the
// static-asset router unchanged. No backend needed — the follower snapshot,
// the diff, and the local "waves" leaderboard all run in the browser against
// localStorage; there's nothing here for a server to do.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
