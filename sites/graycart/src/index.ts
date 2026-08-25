// graycart Worker — served at the root of graycart.bisks.net. Pure static
// site: the cartridge (rules, level, sprites, sounds) is generated fresh in
// the browser on every load, so there's nothing for this Worker to do but
// hand requests to the static-asset router.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
