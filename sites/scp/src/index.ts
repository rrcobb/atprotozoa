// scp Worker — scp.bisks.net
//
// @norvid-studies.bsky.social asked @buildthis to write an SCP entry for
// every one of its existing sites and post them in a single directory.
// Every page here is static (generate.mjs writes public/index.html and
// public/entries/scp-*.html straight from the sites/*/site.json manifests
// that already drive the apex gallery), so the Worker's only job is to
// forward to the static-asset router.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
