// Served at the root of neuralese.bisks.net, so requests pass straight to the
// static-asset router. No server-side surface — encoding and decoding both
// happen entirely in the browser.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
