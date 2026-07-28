// padmoot Worker — mounted at bisks.net/padmoot/ (see
// notes/40-new-site-playbook.md). Pure static site; the main server job is
// stripping the "/padmoot" mount prefix before handing the request to the
// static-asset router, since the assets directory has no idea it's not
// living at the domain root.
//
// One extra job: redirect the bare "/padmoot" (no trailing slash) to
// "/padmoot/". index.html's <script src="lib/...">/import "./lib/..." refs
// are relative, and the browser resolves relative URLs against the address
// bar, not the mount prefix. Hit "bisks.net/padmoot" (no slash) directly —
// exactly the link the last build posted — and "lib/oauth.js" resolves to
// "bisks.net/lib/oauth.js" (the last path *segment* gets dropped, same as
// "/a/b" + "c" -> "/a/c"), 404ing every JS file the page needs. With the
// trailing slash in the address bar, the same relative refs resolve under
// "/padmoot/" correctly.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

const PREFIX = "/padmoot";

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
