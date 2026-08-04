// explainu-chan Worker — explainu-chan.bisks.net
//
// Pure static site: the mascot, the libgrid explanation, and the breakthrough
// generator are all client-side. Served at the root of its own hostname, so
// requests pass straight to the static-asset router.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
