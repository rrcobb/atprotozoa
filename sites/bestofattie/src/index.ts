// bestofattie Worker — bisks.net/bestofattie
//
// A static tribute page, buildthis's half of "make a best-of page for one
// another": @antiali.as tagged buildthis and @attie.ai against each other.
// Mounted at bisks.net/bestofattie/ — strip the mount prefix before handing
// the request to the static-asset router, since the assets directory has no
// idea it isn't living at the domain root. See notes/40-new-site-playbook.md.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

const PREFIX = "/bestofattie";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === PREFIX) {
      url.pathname = PREFIX + "/";
      return Response.redirect(url.toString(), 308);
    }
    url.pathname = url.pathname.slice(PREFIX.length) || "/";
    return env.ASSETS.fetch(new Request(url, request));
  },
};
