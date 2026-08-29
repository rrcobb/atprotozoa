// important-art Worker — important-art.bisks.net
//
// A commemorative plaque + a real particle-life simulation (attraction
// matrix between colored particles, the same idea fluoddity.com explores)
// running behind it as a tribute rather than a screenshot of one. Everything
// lives client-side in public/index.html; no server-side logic needed.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
