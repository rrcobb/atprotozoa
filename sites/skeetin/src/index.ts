// SkeetIn is a static public-AppView client. Share URLs are handled by the
// browser and Corvid claims are local-only; no server-side state is implied.
export interface Env {
  ASSETS: { fetch: (request: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/s/")) {
      return env.ASSETS.fetch(new Request(new URL("/", request.url), request));
    }
    return env.ASSETS.fetch(request);
  },
};
