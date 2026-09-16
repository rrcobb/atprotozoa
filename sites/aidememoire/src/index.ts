// aidememoire Worker — aidememoire.bisks.net
//
// Everything real happens client-side (public/index.html + public/app.js):
// find a public app.bsky.graph.block record, pull both accounts' repos, and
// run a local heuristic classifier over the text. No server-side compute,
// no per-result share route (yet) — falls through to ASSETS for everything.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
