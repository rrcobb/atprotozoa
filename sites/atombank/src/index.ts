// atombank Worker — served at the root of atombank.bisks.net.
// Pure static site: dedup, the vault (localStorage), and the share card are
// all client-side. The Worker just forwards to the static-asset router.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
