// lorebsky Worker — lorebsky.bisks.net
// All the work is client-side (public/index.html); this just serves assets.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
