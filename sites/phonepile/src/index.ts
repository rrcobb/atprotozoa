// Served at the root of phonepile.bisks.net, so requests are passed to the
// static-asset router unchanged. No server-side surface — the pile, the
// physics, and the phone data all live in public/.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
