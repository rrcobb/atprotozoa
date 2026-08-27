// Served at the root of instanceof.bisks.net, so requests are passed to the
// static-asset router unchanged. No server-side surface — the Wikidata
// climbing happens client-side, straight from the browser.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
