// quadrants Worker: static assets plus public share-card rendering.
// Chart definitions and positions are no longer kept in a server index. The
// browser owns its drafts and writes positions to the user's PDS.
export interface Env {
  ASSETS: { fetch: (request: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/quadrants") {
      url.pathname = "/quadrants/";
      return Response.redirect(url.toString(), 308);
    }
    if (url.pathname.startsWith("/quadrants/")) url.pathname = url.pathname.slice("/quadrants".length) || "/";
    return env.ASSETS.fetch(new Request(url, request));
  },
};
