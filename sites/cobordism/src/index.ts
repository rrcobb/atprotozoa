// Served at the root of cobordism.bisks.net, so requests are passed to the
// static-asset router unchanged. No server-side surface — the whole toy runs
// client-side in three.js.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
