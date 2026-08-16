// Served at the root of kolpelor.bisks.net — everything runs client-side
// against Bluesky's public AppView and the signed-in player's own PDS, so the
// Worker just forwards to the static-asset router.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
