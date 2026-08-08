// Served at the root of showdown.bisks.net. The battle itself runs entirely
// client-side (the @pkmn/sim engine is bundled for the browser — see
// build/bundle.mjs) so there's no server-side battle state to manage. This
// Worker just forwards to the static-asset router.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
