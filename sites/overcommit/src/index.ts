// overcommit Worker — overcommit.bisks.net
// Everything lives client-side in public/ (a browser WebSocket straight to
// Jetstream v2, no server state). This Worker just serves the static shell.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
