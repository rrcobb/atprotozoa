// tweetdown Worker — served at the root of tweetdown.bisks.net
// (see notes/40-new-site-playbook.md). Pure static site; the two usernames
// and the whole showdown are generated client-side, so there is nothing for
// a server to do.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
