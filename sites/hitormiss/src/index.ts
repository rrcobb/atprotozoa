// hitormiss Worker — served at the root of hitormiss.bisks.net.
// Static page; just forward to the assets binding.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
