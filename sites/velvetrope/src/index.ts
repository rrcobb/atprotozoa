// velvetrope is a static client. Public list reads and writes to the owning
// user's PDS happen in the browser; there is no server-side request queue.
export interface Env {
  ASSETS: { fetch: (request: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/u/") || url.pathname.startsWith("/list/")) {
      return env.ASSETS.fetch(new Request(new URL("/", request.url), request));
    }
    return env.ASSETS.fetch(request);
  },
};
