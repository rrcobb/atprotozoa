// Served at the root of xrate.bisks.net. Everything runs client-side (the
// converter fetches live rates straight from the Frankfurter API in the
// browser), so the Worker's only job is to hand requests to the static-asset
// router.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
