// Served at the root of thumbjack.bisks.net. Everything — fetching a
// handle's recent posts, picking a clickbait frame, drawing the thumbnail —
// happens client-side in public/app.js (frontend-first, no server state).
// This Worker just forwards to the static-asset router.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
