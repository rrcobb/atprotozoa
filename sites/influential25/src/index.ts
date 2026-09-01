// Influential25 is intentionally static. Nominations are user-owned atproto
// records and profile reads use the public AppView; there is no global
// server index.
export interface Env {
  ASSETS: { fetch: (request: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/p/")) {
      return env.ASSETS.fetch(new Request(new URL("/profile.html", request.url), request));
    }
    return env.ASSETS.fetch(request);
  },
};
