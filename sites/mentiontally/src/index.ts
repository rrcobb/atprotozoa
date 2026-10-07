// mentiontally Worker — mentiontally.bisks.net. Everything runs in the browser;
// the Worker only forwards to static assets.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
