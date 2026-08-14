export interface Env {
  ASSETS: { fetch: (request: Request) => Promise<Response> };
}

// The canvas is a local, browser-owned sketch rather than an authoritative
// multiplayer board. A signed-in PDS record can be added without a relay.
export default {
  fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const prefix = "/the-place";
    if (url.pathname === prefix) {
      url.pathname = prefix + "/";
      return Promise.resolve(Response.redirect(url.toString(), 308));
    }
    if (url.pathname.startsWith(prefix + "/")) url.pathname = url.pathname.slice(prefix.length) || "/";
    return env.ASSETS.fetch(new Request(url, request));
  },
};
