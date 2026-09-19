// Served at the root of taqsim.bisks.net. Everything lives in public/ and
// runs in the browser (Web Audio) — no server-side surface needed here.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
