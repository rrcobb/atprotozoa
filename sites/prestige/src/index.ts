// Served at the root of prestige.bisks.net, so requests are passed to the
// static-asset router unchanged. No dynamic server surface: OAuth is a
// public-client browser flow and the chain viewer reads public XRPC
// endpoints directly from the client.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
