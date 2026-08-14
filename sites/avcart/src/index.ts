export interface Env {
  ASSETS: { fetch: (request: Request) => Promise<Response> };
}

// avcart is intentionally browser-owned now. The Worker only serves static
// assets; AppView reads and the room draft live in each visitor's browser.
export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
