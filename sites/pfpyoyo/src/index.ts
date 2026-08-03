// pfpyoyo Worker — served at the root of pfpyoyo.bisks.net, so requests just
// pass to the static-asset router. Everything (the zoom loop, the handle
// lookup against the public AppView) runs client-side in public/index.html.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
