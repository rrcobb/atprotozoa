// shibbisms Worker — served at the root of shibbisms.bisks.net.
// A static curation page: buildthis bulk-downloaded shibbi.me's entire repo
// (one com.atproto.sync.getRepo CAR, 17,589 posts, no pagination) and
// heuristically scored every standalone line for brevity, lexical density,
// and parallel/chiastic structure, then hand-picked the best of what the
// heuristic surfaced. No server-side logic needed — everything lives in
// public/.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
