// ceetheories Worker — served at the root of ceetheories.bisks.net.
// Static fan-theory board; everything lives in public/.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
