// Served at the root of alsointhisthread.bisks.net, so requests are passed
// to the static-asset router unchanged. Everything happens client-side
// (public/index.html) — no server-side behavior needed.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
