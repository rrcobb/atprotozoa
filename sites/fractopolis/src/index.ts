// Served at the root of fractopolis.bisks.net, so requests are passed to the
// static-asset router unchanged. No server-side behavior — the city is
// generated entirely client-side (a seed in the URL reproduces the same
// palette/style, but zoom position is never round-tripped).
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
