// Mounted at bisks.net/games/fitzcarraldo/ — strips the mount prefix before handing the
// request to the static-asset router, since the assets directory has no idea
// it isn't living at the domain root.
//
// The old fitzcarraldo.bisks.net custom domain is still live in Cloudflare (the
// 2026-07-26 migration to this path route didn't deprovision it), and still
// routes here. Requests through it arrive WITHOUT the /games/fitzcarraldo
// prefix, so an unconditional slice(PREFIX.length) chopped the front off every
// short path (e.g. "/game.js" -> "") and fell back to "/", serving index.html
// in place of every asset — game.js, portal.js, og.png — which is why the game
// silently failed to load there (reported 2026-07-27). Only strip the prefix
// when it's actually present.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

const PREFIX = "/games/fitzcarraldo";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === PREFIX || url.pathname.startsWith(PREFIX + "/")) {
      url.pathname = url.pathname.slice(PREFIX.length) || "/";
    }
    return env.ASSETS.fetch(new Request(url, request));
  },
};
