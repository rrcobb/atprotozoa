// Served at the root of spawnkit.bisks.net, so requests are passed to the
// static-asset router unchanged. Everything spawnkit does (the generator) runs
// client-side in public/ — no server surface needed.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
