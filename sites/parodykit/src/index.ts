// parodykit Worker — parodykit.bisks.net
//
// Everything runs client-side (public/index.html): fetching both profiles
// from the public AppView, compositing the avatar/banner on <canvas> out of
// the two accounts' real image files, and blending the bio text. No server
// surface needed beyond serving the static shell.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
