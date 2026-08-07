// Served at the root of trashpanda.bisks.net, so requests are passed to the
// static-asset router unchanged. Everything else lives in public/ and runs
// client-side.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
