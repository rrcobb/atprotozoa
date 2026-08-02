// Served at the root of claimstamp.bisks.net, so requests are passed to the
// static-asset router unchanged. Everything the site does (parsing a post
// URL, reading the public AppView, the stamp/shatter/burn animation) happens
// client-side in public/index.html — no server-side surface needed.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
