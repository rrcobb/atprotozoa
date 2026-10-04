// Served at the root of mootpocalypse.bisks.net, so requests pass straight
// through to the static-asset router — no mount-prefix stripping needed.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
