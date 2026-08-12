// taste Worker — taste.bisks.net
//
// @cee.wtf posted "I know I have Taste when other people use my
// @buildthis.bisks.net creations", quote-tagging their own "only the people
// with Taste and Style ... will remain after ai replaces all tech jobs"
// line. This site literalizes the boast: generate.mjs reads every
// sites/*/site.json manifest (the same ones that drive the apex gallery and
// scp.bisks.net) at build time and computes, for every handle that's ever
// been credited as `by`, how many sites are directly theirs and how many
// OTHER builders' sites mention them in the blurb — someone else running
// with their idea. All computed and served statically; the Worker's only
// job is to forward to assets.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
