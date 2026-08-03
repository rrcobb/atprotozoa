// Served at the root of biskywang.bisks.net, so requests are passed to the
// static-asset router unchanged. Everything the site does (parsing a post
// URL or pasted text, reading the public AppView, running the secret
// algorithm, the board/verdict animation) happens client-side in
// public/index.html — no server-side surface needed.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
