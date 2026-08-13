// griftmax's data integrations run in the browser. The Worker only serves the
// static site; there are no dynamic API routes or server-owned state.

export interface Env {
  ASSETS: { fetch: (request: Request) => Promise<Response> };
}

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
