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

    // Everything else: the static landing page.
    return env.ASSETS.fetch(request);
  },
};
