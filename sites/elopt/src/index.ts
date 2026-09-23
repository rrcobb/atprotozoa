// elopt Worker — served at the root of elopt.bisks.net.
//
// Everything (opt-in, battles, elo, the leaderboard) runs client-side against
// the atproto network: public/lib/oauth.js signs writes straight to the
// signed-in user's own PDS, and public/lib/global-index.js replays every
// net.bisks.elopt.optin / net.bisks.elopt.vote record network-wide
// (com.atproto.sync.listReposByCollection + a live Jetstream tail) to build
// the roster and the leaderboard. No KV, no Durable Object, no Workers AI —
// this Worker is a bare static-asset passthrough.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
