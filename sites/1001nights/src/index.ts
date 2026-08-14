// 1001nights Worker
//
// Served at the root of 1001nights.bisks.net. No server-side logic — the
// tales are a static JSON snapshot (public/data/tales.json) copied from
// receipts' archive at build time, and every animation runs client-side.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
