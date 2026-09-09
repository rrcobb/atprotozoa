// Served at the root of kinesin.bisks.net. Everything lives in the
// browser (physics, keyboard input, local best score) — the Worker just
// forwards to static assets.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
