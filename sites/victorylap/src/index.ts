// victorylap Worker — victorylap.bisks.net
//
// Fully static: the whole lap, scoreboard, and share card run client-side in
// public/app.js. No per-result server route — sharing goes through the
// intent-compose link and a canvas-rendered share card, not a dynamic
// unfurl page.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
