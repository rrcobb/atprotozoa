// sepcheck Worker
//
// Mounted at bisks.net/sepcheck/ — strips the mount prefix before handing
// the request to the static-asset router, since the assets directory has no
// idea it isn't living at the domain root. Everything else (word detection,
// the interpretation picker, the objection quiz) runs client-side; there's
// no server state here.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

const PREFIX = "/sepcheck";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    // The gallery card and every share link point at the bare "/sepcheck"
    // (no trailing slash). Rewriting that internally to "/" and handing it
    // straight to ASSETS.fetch used to serve index.html's bytes at that URL
    // without ever telling the browser the real path changed — so the page
    // loaded, but its relative asset refs (style.css, app.js) resolved
    // against "/" instead of "/sepcheck/" and 404'd, silently killing all
    // JS (no chips, no working post button). Redirect to the slash-terminated
    // URL first so relative resolution in index.html is correct.
    if (url.pathname === PREFIX) {
      url.pathname = PREFIX + "/";
      return Response.redirect(url.toString(), 301);
    }
    url.pathname = url.pathname.slice(PREFIX.length) || "/";
    return env.ASSETS.fetch(new Request(url, request));
  },
};
