// Mounted at bisks.net/code-for-airports/ — strips the mount prefix before handing the
// request to the static-asset router, since the assets directory has no idea
// it isn't living at the domain root.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

const PREFIX = "/code-for-airports";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    url.pathname = url.pathname.slice(PREFIX.length) || "/";
    return env.ASSETS.fetch(new Request(url, request));
  },
};
