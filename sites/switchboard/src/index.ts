// Served at the root of switchboard.bisks.net, so requests pass straight to
// the static-asset router. No server-side surface — encoding happens entirely
// in the browser; decoding happens later, offline, in decode.mjs (see
// notes on that file for why it isn't wired to a route).
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
