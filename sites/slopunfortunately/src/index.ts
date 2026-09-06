// slop unfortunately — slopunfortunately.bisks.net
//
// A one-page fake trailer/poster site for the Christmas rom-com pitched by
// @antiali.as in a reply thread. Everything (the mad-lib pitch generator,
// the countdown, the share card) runs client-side in public/index.html —
// there's no per-visitor state worth a server route for, so this Worker just
// forwards to the static-asset binding.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
