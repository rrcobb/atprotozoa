// Served at the root of splicepedia.bisks.net. Everything — fetching random
// Wikipedia articles, splitting sentences, scoring splices, beam search — runs
// client-side in public/app.js against Wikipedia's own CORS-enabled API. No
// server logic needed beyond serving the static shell.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
