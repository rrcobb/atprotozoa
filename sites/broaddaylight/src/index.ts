// Served at the root of broaddaylight.bisks.net; everything runs client-side
// against real sun-angle math, so the Worker just forwards to static assets.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
