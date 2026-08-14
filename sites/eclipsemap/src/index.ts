// Served at the root of eclipsemap.bisks.net. Everything here is a static,
// client-computed orrery — no server state, no OAuth, no per-request work —
// so the Worker is just the ASSETS passthrough.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
