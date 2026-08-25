// botcharter Worker
//
// Served at the root of botcharter.bisks.net. No server-side logic at all —
// the ratification tally lives in localStorage and the cosign is just a
// Bluesky compose intent.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
