// Served at the root of commonweal.bisks.net. Everything lives in the browser
// (charter state round-trips through the URL, sortition/election/tally math
// runs client-side) — no server-side behavior needed, so this just forwards
// to the static-asset router.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
