// games Worker — the index for the games cluster, at bisks.net/games/
//
// Four game sites (crowofpersia, cutitclose, platoscave, slopwater) linked to
// bisks.net/games expecting an index page; there wasn't one, so those links
// 404'd. This is that page.
//
// Unlike every other site here this one is genuinely path-mounted rather than
// on its own subdomain: "games" is a cluster name, not a site, and the games
// themselves each live at <name>.bisks.net. So the mount prefix is real and
// has to be stripped — but still only when it's actually present, in case this
// is ever reached another way.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

const PREFIX = "/games";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Without the trailing slash the browser resolves relative URLs against
    // "/games" as a filename rather than a directory. Redirect first.
    if (url.pathname === PREFIX) {
      url.pathname = PREFIX + "/";
      return Response.redirect(url.toString(), 308);
    }

    if (url.pathname.startsWith(PREFIX + "/")) {
      url.pathname = url.pathname.slice(PREFIX.length) || "/";
    }
    return env.ASSETS.fetch(new Request(url, request));
  },
};
