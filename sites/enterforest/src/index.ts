// enterforest Worker — served at the root of enterforest.bisks.net, so
// requests are passed to the static-asset router unchanged. No dynamic
// surface: the whole choose-your-own-adventure runs client-side.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
