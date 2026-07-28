// solvers Worker — mounted at bisks.net/solvers/ (see
// notes/40-new-site-playbook.md). Pure static site (the solver runs in the
// browser via wasm); the server job is stripping the "/solvers" mount prefix
// before handing the request to the static-asset router, since the assets
// directory has no idea it's not living at the domain root.
//
// One extra wrinkle vs. the barebones template: this site has a *subdirectory*
// index (public/magnetostatics/index.html). The asset router serves that via a
// trailing-slash redirect (/magnetostatics -> /magnetostatics/), and it builds
// that Location off the *stripped* path, so it would send the browser to
// bisks.net/magnetostatics/ (no /solvers, 404). So we re-add the prefix to any
// same-origin redirect Location the asset router returns.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

const PREFIX = "/solvers";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === PREFIX) {
      url.pathname = PREFIX + "/";
      return Response.redirect(url.toString(), 308);
    }
    url.pathname = url.pathname.slice(PREFIX.length) || "/";
    const res = await env.ASSETS.fetch(new Request(url, request));

    // If the asset router emitted a redirect (e.g. dir-index trailing slash),
    // its Location dropped the mount prefix — put it back.
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (loc && loc.startsWith("/") && !loc.startsWith(PREFIX + "/") && loc !== PREFIX) {
        const fixed = new Response(res.body, res);
        fixed.headers.set("location", PREFIX + loc);
        return fixed;
      }
    }
    return res;
  },
};
