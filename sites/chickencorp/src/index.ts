// Served at the root of chickencorp.bisks.net — a static slide deck, so every
// request just falls through to the ASSETS binding.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
