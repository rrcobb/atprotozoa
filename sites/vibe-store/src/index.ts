// vibe-store Worker — mounted at bisks.net/vibe-store/ (see
// notes/40-new-site-playbook.md). Pure static site; the only server job is
// stripping the "/vibe-store" mount prefix before handing the request to the
// static-asset router, since the assets directory has no idea it isn't
// living at the domain root.
//
// One extra job, copied from sites/padmoot/src/index.ts: redirect the bare
// "/vibe-store" (no trailing slash) to "/vibe-store/". index.html's relative
// <script src="lib/...">/import "./lib/..." refs resolve against the address
// bar, not the mount prefix — without the slash, "lib/oauth.js" resolves to
// "/lib/oauth.js" (the last path segment gets dropped), 404ing every JS file
// the page needs.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

const PREFIX = "/vibe-store";

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
