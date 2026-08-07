// blockledger Worker — RETIRED
//
// This tool crawled a person's mutuals and cross-referenced their public
// block lists. It was pulled at the request of the person who originally
// asked for it (see RETIRED.md). Reduced to a static retirement stub: the
// old /s/<handle> share route and the client-side crawl logic are gone.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
