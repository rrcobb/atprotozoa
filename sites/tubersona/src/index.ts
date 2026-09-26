// tubersona is a static, browser-only toy. Every dig, patch, and share card
// lives in the browser; the Worker only serves the static assets.

export interface Env {
  ASSETS: { fetch: (request: Request) => Promise<Response> };
}

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
