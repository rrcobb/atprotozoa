// pvnp Worker — mounted at bisks.net/pvnp/ (see
// notes/40-new-site-playbook.md). Pure static site; the only server job is
// stripping the "/pvnp" mount prefix before handing the request to the
// static-asset router, since the assets directory has no idea it's not
// living at the domain root.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

const PREFIX = "/pvnp";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    // Bare "/pvnp" (no trailing slash) has to 308 to "/pvnp/" first: the
    // page's <script type="module"> imports "./lib/pvnp.js", and browsers
    // resolve that relative import against the exact request URL. Without
    // the trailing slash it resolves to "/lib/pvnp.js" (one directory up,
    // off the mount entirely) and 404s, silently killing every button's
    // click handler since the import throws before addEventListener runs.
    if (url.pathname === PREFIX) {
      url.pathname = PREFIX + "/";
      return Response.redirect(url.toString(), 308);
    }
    url.pathname = url.pathname.slice(PREFIX.length) || "/";
    return env.ASSETS.fetch(new Request(url, request));
  },
};
