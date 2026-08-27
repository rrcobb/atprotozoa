// Served at the root of distrotycoon.bisks.net, so requests are passed to
// the static-asset router unchanged. The whole game (distro builder,
// discourse-meter tycoon loop, save state) lives in public/index.html; there
// is no server-side game logic or per-result share route.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
