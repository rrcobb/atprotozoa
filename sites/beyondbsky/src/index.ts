// beyondbsky Worker — beyondbsky.bisks.net
//
// A static explainer, written in reply to @alexbenzer.com asking builders
// whether communities would want a separate app or site of their own.
//
// The gallery card for this site was committed on 2026-07-28 by an unrelated
// buildthis run (e5929e4, "simcluster-atlas") but the site itself never
// existed, so the card 404'd from the day it landed. This fills it in.
//
// Serving is the whole job: a hostname route with no path mount, so there is
// no prefix to strip.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
