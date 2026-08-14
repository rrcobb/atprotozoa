// runway Worker — runway.bisks.net
//
// Pure static site, own hostname, no path prefix to strip. Just hands every
// request to ASSETS.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
