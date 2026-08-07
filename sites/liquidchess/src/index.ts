// Served at the root of liquidchess.bisks.net, so requests are passed to the
// static-asset router unchanged. No server-side surface needed — the whole
// game runs client-side.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
