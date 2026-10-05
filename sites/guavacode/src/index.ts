// guavacode Worker — guavacode.bisks.net.
//
// Pure static site: the browser streams the guava genome from NCBI and does
// all the counting. Every request falls through to ASSETS.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
