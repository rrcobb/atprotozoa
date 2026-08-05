// sidenote Worker
//
// Served at the root of sidenote.bisks.net. No server-side logic — the diary
// itself is a static JSON file (public/data/entries.json) that later build
// runs edit directly, same as any other file in the repo.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
