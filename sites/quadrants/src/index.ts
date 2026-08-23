// quadrants Worker: static assets plus routing for a chart's shareable link.
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

    // /c/<id> and /c/<id>/ are a chart's shareable link — there's no file at
    // that path (a chart's id is minted client-side, never written to disk),
    // so without this rewrite every shared chart link 404s. chart.html reads
    // the id straight back out of location.pathname, so no server-side
    // templating is needed, just pointing the request at the right file.
    if (/^\/c\/[^/]+\/?$/.test(url.pathname)) {
      url.pathname = "/chart.html";
      return env.ASSETS.fetch(new Request(url, request));
    }

    return env.ASSETS.fetch(new Request(url, request));
  },
};
