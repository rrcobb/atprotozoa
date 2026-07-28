// Mounted at bisks.net/games/mootcycle/ — strips the mount prefix before
// handing the request to the static-asset router, since the assets
// directory has no idea it isn't living at the domain root. Guarded (only
// strips when the path actually starts with PREFIX) so a request that
// somehow arrives without it — e.g. a stale/aliased hostname, see the
// fitzcarraldo postmortem in notes/20-deploy.md — passes through unchanged
// instead of getting its front chopped off.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

const PREFIX = "/games/mootcycle";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === PREFIX || url.pathname.startsWith(PREFIX + "/")) {
      url.pathname = url.pathname.slice(PREFIX.length) || "/";
    }
    return env.ASSETS.fetch(new Request(url, request));
  },
};
