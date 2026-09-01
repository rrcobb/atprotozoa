// Served at the root of pointless.bisks.net, so requests are passed to the
// static-asset router unchanged. Nothing here needs a server — the whole
// point is that it does nothing.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
