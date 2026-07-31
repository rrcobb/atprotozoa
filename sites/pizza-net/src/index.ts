// pizza-net Worker — pizza-net.bisks.net.
//
// Pure static recreation, no dynamic routes: every request just falls
// through to the ASSETS binding.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
