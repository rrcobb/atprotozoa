// doomolingo Worker — served at the root of doomolingo.bisks.net (see
// notes/40-new-site-playbook.md). Pure static site; the whole game (word
// decks, the wave loop, health/ammo, scoring) runs client-side in
// public/ — there is nothing for a server to do.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
