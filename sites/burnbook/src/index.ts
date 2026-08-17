// Served at the root of burnbook.bisks.net. Every book is generated and
// destroyed entirely client-side — nothing about a book is ever sent to or
// stored by the Worker, which just serves the static shell.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
