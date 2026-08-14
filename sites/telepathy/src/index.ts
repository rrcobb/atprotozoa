// Served at the root of telepathy.bisks.net — the test is entirely
// client-side (public/app.js picks the target card, scores guesses, tracks
// attempts), so the Worker is just the ASSETS passthrough.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
