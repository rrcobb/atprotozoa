// prosodle Worker — prosodle.bisks.net.
//
// Pure static site, no dynamic routes: every request falls through to the
// ASSETS binding. The daily roll, scoring, and sharing all happen
// client-side in public/index.html.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
