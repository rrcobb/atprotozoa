// Served at the root of gpuburn.bisks.net. The whole calculator runs
// client-side (public/index.html) — this Worker just forwards to the static
// asset router. No secrets, no server state.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
