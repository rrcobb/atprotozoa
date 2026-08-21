// Served at the root of idioms.bisks.net. No server-side logic — the
// collection itself is a static JSON file (public/data/idioms.json) that
// later build runs append a new entry to, same as any other file in the
// repo. Someone tags the bot quoting an idiom, the bot adds it here.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
