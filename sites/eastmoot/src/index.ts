export interface Env {
  ASSETS: { fetch: (request: Request) => Promise<Response> };
}

// Ranked ballots are local drafts. Instant-runoff is still calculated in the
// browser, but no server claims to collect or declare a group decision.
export default {
  fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const prefix = "/eastmoot";
    if (url.pathname === prefix) {
      url.pathname = prefix + "/";
      return Promise.resolve(Response.redirect(url.toString(), 308));
    }
    if (url.pathname.startsWith(prefix + "/")) url.pathname = url.pathname.slice(prefix.length) || "/";
    return env.ASSETS.fetch(new Request(url, request));
  },
};
