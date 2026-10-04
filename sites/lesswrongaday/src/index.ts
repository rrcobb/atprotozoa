// lesswrongaday Worker: serves static assets, plus GET /api/day?date=YYYY-MM-DD,
// which asks LessWrong's GraphQL endpoint for that UTC day's posts and comments.
// The queries are fixed server-side so this isn't an open proxy.

interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

const GQL = "https://www.lesswrong.com/graphql";
const BATCH = 500;
// Workers allow 50 subrequests per invocation; stop well under it. No LessWrong
// day has come anywhere near 20 batches (10,000 comments) of activity.
const MAX_BATCHES = 20;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY = 86400e3;

async function gql(query: string): Promise<any> {
  const up = await fetch(GQL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query }),
  });
  if (!up.ok) throw new Error("upstream " + up.status);
  const j = (await up.json()) as any;
  if (!j?.data) throw new Error("upstream shape");
  return j.data;
}

export default {
  async fetch(req: Request, env: Env, ctx: { waitUntil(p: Promise<unknown>): void }): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname !== "/api/day") return env.ASSETS.fetch(req);
    if (req.method !== "GET") return new Response("method not allowed", { status: 405 });

    const after = url.searchParams.get("date") || "";
    if (!DATE.test(after) || isNaN(Date.parse(after))) return new Response("bad date", { status: 400 });
    const before = new Date(Date.parse(after) + DAY).toISOString().slice(0, 10);

    const cache = (caches as unknown as { default: Cache }).default;
    const hit = await cache.match(req);
    if (hit) return hit;

    try {
      const posts: any[] = [];
      const comments: any[] = [];
      for (let i = 0; i < MAX_BATCHES; i++) {
        const d = await gql(`{posts(input:{terms:{view:"new",limit:${BATCH},offset:${i * BATCH},after:"${after}",before:"${before}"}}){results{_id title postedAt slug baseScore commentCount user{displayName slug} contents{plaintextDescription}}}}`);
        const r = d?.posts?.results || [];
        posts.push(...r);
        if (r.length < BATCH) break;
      }
      for (let i = 0; i < MAX_BATCHES; i++) {
        const d = await gql(`{comments(input:{terms:{view:"allRecentComments",limit:${BATCH},offset:${i * BATCH},after:"${after}",before:"${before}"}}){results{_id postedAt baseScore postId user{displayName slug} post{title slug} contents{plaintextMainText}}}}`);
        const r = d?.comments?.results || [];
        comments.push(...r);
        if (r.length < BATCH) break;
      }
      const out = {
        date: after,
        posts: posts.map((p) => ({
          id: p._id, title: p.title, at: p.postedAt, slug: p.slug, score: p.baseScore,
          comments: p.commentCount, by: p.user?.displayName || "", byslug: p.user?.slug || "",
          // enough text to read a feed entry; the full post is one click away
          excerpt: (p.contents?.plaintextDescription || "").slice(0, 700),
        })),
        comments: comments.map((c) => ({
          id: c._id, at: c.postedAt, score: c.baseScore, postId: c.postId,
          by: c.user?.displayName || "", post: c.post?.title || "", postSlug: c.post?.slug || "",
          text: (c.contents?.plaintextMainText || "").slice(0, 900),
        })),
      };
      // Days that ended more than a day ago can't change; keep them a week.
      const settled = Date.parse(before) < Date.now() - DAY;
      const res = new Response(JSON.stringify(out), {
        headers: {
          "content-type": "application/json",
          "access-control-allow-origin": "*",
          "cache-control": settled ? "public, max-age=604800" : "public, max-age=300",
        },
      });
      ctx.waitUntil(cache.put(req, res.clone()));
      return res;
    } catch (e) {
      return new Response(String((e as Error).message || e), { status: 502 });
    }
  },
};
