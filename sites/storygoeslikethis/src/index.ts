// Served at the root of storygoeslikethis.bisks.net, so requests are passed
// to the static-asset router unchanged. The whole production — cast, script,
// staging, Web Speech voices, in-browser recorder — runs client-side in
// public/. No server surface needed.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
