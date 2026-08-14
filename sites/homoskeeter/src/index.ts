// Served at the root of homoskeeter.bisks.net, so requests pass straight to
// the static-asset router. Everything else (OAuth dance, the "transmission"
// itself) runs client-side in public/.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
