// Served at the root of metamuseum.bisks.net, so requests pass straight
// through to the static-asset router — no mount-prefix stripping needed.
// (Metamuseum used to stamp per-piece /wing and /piece OG tags itself, back
// when it held the wall-text plaques directly. Those exhibits — and that
// dynamic routing — moved to sites/museum on 2026-09-07; this is annex-only
// now, a single static page.)
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
