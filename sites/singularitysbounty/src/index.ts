// singularitysbounty Worker — served at the root of singularitysbounty.bisks.net.
// A personal marketing page for catblanketflower.yuwakisa.com, built from
// every post in their app.bsky.feed.post collection (paginated straight off
// their PDS, no AppView, no engagement sorting). No server-side logic
// needed — everything lives in public/.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
