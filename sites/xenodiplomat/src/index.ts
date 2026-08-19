// xenodiplomat Worker — xenodiplomat.bisks.net
//
// The whole game runs client-side (public/index.html): no per-user record to
// resolve server-side, so there's nothing here but the static-asset fallthrough.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
