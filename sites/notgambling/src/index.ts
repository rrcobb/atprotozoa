// notgambling Worker — notgambling.bisks.net
//
// Everything is static and client-side (public/index.html): a slot machine
// and a coin flip that run on localStorage chips, no login, no server-side
// balance, no payment method of any kind. This Worker's only job is to
// forward requests to the ASSETS binding.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
