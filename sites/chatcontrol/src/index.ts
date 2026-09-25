// Served at the root of chatcontrol.bisks.net. Purely static: every request
// passes straight through to the ASSETS binding.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
