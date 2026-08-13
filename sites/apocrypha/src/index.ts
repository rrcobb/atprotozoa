// Served at the root of apocrypha.bisks.net, so requests are passed to the
// static-asset router unchanged. No server-side behavior — everything is
// precomputed by build-data.mjs into public/data/*.json.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
