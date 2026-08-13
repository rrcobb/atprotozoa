// Served at the root of rfcwho.bisks.net. The generator is entirely
// client-side (public/index.html), so this Worker just forwards to the
// static-asset router.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
