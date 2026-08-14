// bestofcee Worker — served at the root of bestofcee.bisks.net.
// A static tribute page: buildthis read every post cee.wtf has ever made
// (paginated the full app.bsky.feed.post collection off their PDS, no
// shortcuts, no sorting by like count) and picked a favorite. No server-side
// logic needed — everything lives in public/.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
