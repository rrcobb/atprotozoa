// Served at the root of ironclad.bisks.net, so requests are passed to the
// static-asset router unchanged. No server-side behavior needed.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
