// threadwalk Worker — threadwalk.bisks.net
//
// Everything real happens client-side (public/lib/*.js): crawling the public
// AppView for a handle's oomfs (mutual follows), oomfs-of-oomfs, sampling
// candidate posts from that network, scoring each by how many oomfs/oomfs2
// liked it, and laying the result out as a 2D map you walk around with the
// arrow keys. The Worker is a plain static-asset passthrough — no OAuth, no
// per-request server compute, since every read here is on the public,
// unauthenticated AppView (resolveHandle / getFollows / getFollowers /
// getAuthorFeed / getLikes, all CORS *).
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
