// wikifix Worker — mounted at bisks.net/wikifix/. Strips the mount prefix
// before handing the request to the static-asset router, since the assets
// directory has no idea it isn't living at the domain root. Everything else
// (the counter, the "currently correcting" feed) runs client-side against
// Wikipedia's public, CORS-enabled API — no server surface needed here.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

const PREFIX = "/wikifix";

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
