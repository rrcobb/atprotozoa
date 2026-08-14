export interface Env {
  ASSETS: { fetch: (request: Request) => Promise<Response> };
}

// Meetup proposals are local drafts. They are not presented as a shared or
// authoritative vote; users can share the resulting proposal themselves.
export default {
  fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const prefix = "/westmoot";
    if (url.pathname === prefix) {
      url.pathname = prefix + "/";
      return Promise.resolve(Response.redirect(url.toString(), 308));
    }
    if (url.pathname.startsWith(prefix + "/")) url.pathname = url.pathname.slice(prefix.length) || "/";
    return env.ASSETS.fetch(new Request(url, request));
  },
};
