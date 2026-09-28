// atlaslibs Worker — atlaslibs.bisks.net
//
// Pure static site. Everything (region data, mad-lib generator, canvas map)
// runs client-side in public/index.html + public/lib/generator.js; the
// Worker's only job is to hand every request to the static-asset binding.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
