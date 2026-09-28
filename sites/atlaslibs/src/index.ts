// atlaslibs Worker — atlaslibs.bisks.net
//
// Almost a pure static site: region data, mad-lib generator, and canvas map
// all run client-side in public/index.html + public/lib/generator.js. The
// one exception is /api/meta, a same-origin proxy for atlas.jazco.dev's own
// live stats endpoint (atlas-api.jazco.dev/api/meta) — that API's CORS
// header only allows requests from https://atlas.jazco.dev itself, so a
// browser fetch from atlaslibs.bisks.net is blocked; a Worker isn't subject
// to CORS, so it can fetch server-side and hand the JSON back same-origin.
// Everything else falls through to the static-asset binding.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

const ATLAS_META_URL = "https://atlas-api.jazco.dev/api/meta";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api/meta") {
      try {
        const upstream = await fetch(ATLAS_META_URL);
        if (!upstream.ok) {
          return new Response(null, { status: 502 });
        }
        const body = await upstream.text();
        return new Response(body, {
          headers: {
            "content-type": "application/json",
            // Cache briefly so a page-load burst doesn't hammer someone
            // else's API; the atlas itself only rebuilds every six hours,
            // so 30 minutes of staleness costs nothing real.
            "cache-control": "public, max-age=1800",
          },
        });
      } catch {
        return new Response(null, { status: 502 });
      }
    }
    return env.ASSETS.fetch(request);
  },
};
