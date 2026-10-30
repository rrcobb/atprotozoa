// apex Worker for bisks.net
//
// Two jobs:
//  1. Serve /.well-known/atproto-did so bisks.net can be used as a Bluesky
//     handle (HTTP verification). See notes/30-identity-and-did.md.
//  2. Serve the static landing / gallery page for everything else.

interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
  ATPROTO_DID: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Bluesky handle verification: return the DID as plain text, nothing else.
    if (url.pathname === "/.well-known/atproto-did") {
      return new Response(env.ATPROTO_DID, {
        headers: {
          "content-type": "text/plain; charset=utf-8",
          "cache-control": "no-cache",
        },
      });
    }

    // Legacy path-era link, still shared in threads: bisks.net/everzoom/ lost its
    // path route when the zone's route slots were freed (notes/20-deploy.md); the
    // site itself lives on its subdomain. One redirect keeps old posts working
    // without spending a zone route.
    const legacy = url.pathname.match(/^\/everzoom(\/.*)?$/);
    if (legacy) {
      return Response.redirect(
        "https://everzoom.bisks.net" + (legacy[1] || "/") + url.search,
        301,
      );
    }

    // Everything else: the static landing page.
    return env.ASSETS.fetch(request);
  },
};
