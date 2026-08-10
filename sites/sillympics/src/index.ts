// sillympics Worker — served at the root of sillympics.bisks.net (see
// notes/40-new-site-playbook.md). Pure static site; profile-fetching and the
// event-by-event tournament sim all run client-side (see public/index.html +
// public/lib/) — there is nothing for a server to do.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
