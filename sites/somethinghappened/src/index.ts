// Served at the root of somethinghappened.bisks.net, so requests are passed
// to the static-asset router unchanged. No server surface — everything the
// site does happens client-side.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
