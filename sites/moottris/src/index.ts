// moottris Worker — mounted at bisks.net/games/moottris/ (see
// notes/40-new-site-playbook.md). Pure static site; the only server job is
// stripping the "/games/moottris" mount prefix before handing the request to
// the static-asset router, since the assets directory has no idea it's not
// living at the domain root.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

const PREFIX = "/games/moottris";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    url.pathname = url.pathname.slice(PREFIX.length) || "/";
    return env.ASSETS.fetch(new Request(url, request));
  },
};
