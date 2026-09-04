// mootfluence is intentionally static. Ranking data comes from
// net.bisks.influential25.vote records read straight off the network (see
// sites/influential25); moot detection reads the public AppView plus a
// bulk repo CAR download. There is no server-side index.
export interface Env {
  ASSETS: { fetch: (request: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
