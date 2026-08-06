// gracewasright Worker — gracewasright.bisks.net
//
// A fixed slideshow (public/index.html), plus a real downloadable .pptx
// (public/gracewasright.pptx, generated at build time by pptx-gen.mjs — see
// that file for the recipe). No per-request personalization, no per-user
// result, so no dynamic route is needed: just serve the static assets.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
