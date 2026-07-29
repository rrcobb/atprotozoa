// crowofpersia Worker — mounted at bisks.net/games/crowofpersia/ (see
// notes/40-new-site-playbook.md). Pure static site; the only server job is
// stripping the "/games/crowofpersia" mount prefix before handing the
// request to the static-asset router, since the assets directory has no
// idea it's not living at the domain root.
//
// Only strip when the request actually carries the prefix — a request
// arriving through some other still-live hostname (or bare `/`) must pass
// through unchanged, otherwise the slice chops real asset paths short and
// every JS/image request silently 404s into index.html instead (see the
// fitzcarraldo writeup in notes/20-deploy.md).

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

const PREFIX = "/games/crowofpersia";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === PREFIX) {
      url.pathname = PREFIX + "/";
      return Response.redirect(url.toString(), 308);
    }
    if (url.pathname === PREFIX + "/" || url.pathname.startsWith(PREFIX + "/")) {
      url.pathname = url.pathname.slice(PREFIX.length) || "/";
    }
    return env.ASSETS.fetch(new Request(url, request));
  },
};
