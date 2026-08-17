// junipereth Worker — junipereth.bisks.net
//
// Everything runs client-side (public/index.html scans Juniper's own public
// posts for qualifying quote-reposts and tallies the fake balance live on
// every page load). There's exactly one subject — Juniper — so unlike
// didscope there's no per-handle share route to render; og:title/description
// are static and true for every visitor. This Worker just forwards to the
// static-asset router.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
