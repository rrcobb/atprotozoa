// dunbarslots Worker: purely static. Everything (model picker, the METR-style
// chart, the share card) runs client-side in public/. No server state needed.
export interface Env {
  ASSETS: { fetch: (request: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
