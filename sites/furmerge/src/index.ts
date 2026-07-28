// furmerge Worker — mounted at bisks.net/games/furmerge/ (see
// notes/40-new-site-playbook.md). Pure static site; the only server job is
// stripping the "/games/furmerge" mount prefix before handing the request
// to the static-asset router, since the assets directory has no idea it's
// not living at the domain root.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

const PREFIX = "/games/furmerge";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === PREFIX) {
      url.pathname = PREFIX + "/";
      return Response.redirect(url.toString(), 308);
    }
    url.pathname = url.pathname.slice(PREFIX.length) || "/";
    return env.ASSETS.fetch(new Request(url, request));
  },
};
