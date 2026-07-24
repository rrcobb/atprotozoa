// trigrams Worker
//
// The site is "trigrams", and /firehose is its live-firehose view (the only view
// so far). The bare root redirects there; everything else serves static assets.

interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Redirect straight to /firehose/ (with the slash the assets handler wants)
    // so visitors landing on the root don't take an extra hop.
    if (url.pathname === "/") {
      return Response.redirect(new URL("/firehose/", url).toString(), 302);
    }

    return env.ASSETS.fetch(request);
  },
};
