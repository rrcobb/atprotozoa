// listenheimer Worker — listenheimer.bisks.net
//
// Everything runs client-side (see public/lib/*.js): reading a post's likers
// is a public AppView read, building the moderation list is a direct
// OAuth-authenticated write to the signed-in user's own PDS. No per-result
// server route yet — the static shell's OG tags are generic (same for every
// post), which is fine for a first pass; see notes/45-sharing-and-virality.md
// tier 4 if this ever needs a personalized unfurl per shared list.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
