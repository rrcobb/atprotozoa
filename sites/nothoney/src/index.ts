// Served at the root of nothoney.bisks.net, so requests are passed to the
// static-asset router unchanged. No server-side surface: the meme is drawn
// entirely client-side onto a <canvas> from a public getPostThread lookup.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
