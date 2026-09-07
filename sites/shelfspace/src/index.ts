// sites/shelfspace/src/index.ts
// Served at the root of shelfspace.bisks.net. Everything happens client-side
// (public/) — CSV parsing, the Three.js room, Open Library cover fetches —
// so this Worker has nothing to do but hand off to the static-asset router.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
