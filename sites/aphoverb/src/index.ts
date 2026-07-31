// aphoverb Worker — mounted at bisks.net/aphoverb/ (see
// notes/40-new-site-playbook.md). Strips the mount prefix before handing the
// request to the static-asset router, since the assets directory has no idea
// it isn't living at the domain root.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

const PREFIX = "/aphoverb";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    // Only strip when the prefix is actually present — local `wrangler dev`
    // serves at the root with no prefix, so an unconditional slice would
    // mangle every path (e.g. "/data/x.json" losing its first 9 chars).
    if (url.pathname === PREFIX) {
      url.pathname = "/";
    } else if (url.pathname.startsWith(PREFIX + "/")) {
      url.pathname = url.pathname.slice(PREFIX.length);
    }
    return env.ASSETS.fetch(new Request(url, request));
  },
};
