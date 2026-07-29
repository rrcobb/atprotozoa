// cobweb Worker — bisks.net/cobweb
//
// Purely static: strip the /cobweb mount prefix before handing the request
// to the ASSETS binding, since public/ has no idea it isn't living at the
// domain root. No dynamic routes — the whole point of this site is that
// nothing in it is server-rendered or fetched live (see public/index.html).

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

const PREFIX = "/cobweb";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === PREFIX) {
      url.pathname = PREFIX + "/";
      return Response.redirect(url.toString(), 308);
    }
    const path = url.pathname.slice(PREFIX.length) || "/";
    const assetUrl = new URL(request.url);
    assetUrl.pathname = path;
    return env.ASSETS.fetch(new Request(assetUrl, request));
  },
};
