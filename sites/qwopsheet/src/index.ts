// Served at the root of qwopsheet.bisks.net. Everything lives in the
// browser (formula engine, physics, local best score) — the Worker just
// forwards to static assets.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
