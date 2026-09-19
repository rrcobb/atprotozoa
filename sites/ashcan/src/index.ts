// Served at the root of ashcan.bisks.net, so requests are passed to the
// static-asset router unchanged. Nothing server-side needed: the post fetch,
// the fire animation, and the share card are all in the browser.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
