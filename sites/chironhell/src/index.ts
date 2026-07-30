// Mounted at bisks.net/chironhell — strips the mount prefix before handing
// the request to the static-asset router, since the assets directory has no
// idea it isn't living at the domain root. Pure static site: every chiron is
// rendered client-side straight off the Jetstream firehose, no server state.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

const PREFIX = "/chironhell";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === PREFIX) {
      url.pathname = PREFIX + "/";
      return Response.redirect(url.toString(), 308);
    }
    if (url.pathname === PREFIX || url.pathname.startsWith(PREFIX + "/")) {
      url.pathname = url.pathname.slice(PREFIX.length) || "/";
    }
    return env.ASSETS.fetch(new Request(url, request));
  },
};
