// chesswrong Worker: serves static assets, plus GET /api/posts?after=&before=&offset=
// which asks LessWrong's GraphQL endpoint for one window of posts. The query is
// fixed server-side so this isn't an open proxy. Past windows are edge-cached.

interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

const GQL = "https://www.lesswrong.com/graphql";
// Largest batch we ask for per request; the client pages by offset until a
// batch comes back empty, so this only bounds response size, not coverage.
const BATCH = 500;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export default {
  async fetch(req: Request, env: Env, ctx: { waitUntil(p: Promise<unknown>): void }): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname !== "/api/posts" && url.pathname !== "/api/post") return env.ASSETS.fetch(req);
    if (req.method !== "GET") return new Response("method not allowed", { status: 405 });
    if (url.pathname === "/api/post") return onePost(url, req, ctx);

    const after = url.searchParams.get("after") || "";
    const before = url.searchParams.get("before") || "";
    const offset = Math.max(0, parseInt(url.searchParams.get("offset") || "0", 10) || 0);
    if (!DATE.test(after) || !DATE.test(before)) return new Response("bad dates", { status: 400 });

    const cache = (caches as unknown as { default: Cache }).default;
    const hit = await cache.match(req);
    if (hit) return hit;

    const query = `{posts(input:{terms:{view:"new",limit:${BATCH},offset:${offset},after:"${after}",before:"${before}"}}){results{_id title postedAt slug baseScore commentCount user{displayName slug}}}}`;
    const up = await fetch(GQL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query }),
    });
    if (!up.ok) return new Response("upstream " + up.status, { status: 502 });
    const data = (await up.json()) as { data?: { posts?: { results?: unknown[] } } };
    const results = data?.data?.posts?.results;
    if (!Array.isArray(results)) return new Response("upstream shape", { status: 502 });

    // Windows that ended more than a day ago can't change; keep them a week.
    const settled = Date.parse(before) < Date.now() - 86400e3;
    const res = new Response(JSON.stringify(results), {
      headers: {
        "content-type": "application/json",
        "access-control-allow-origin": "*",
        "cache-control": settled ? "public, max-age=604800" : "public, max-age=300",
      },
    });
    ctx.waitUntil(cache.put(req, res.clone()));
    return res;
  },
};

// GET /api/post?id=<LessWrong post id>: one post with its HTML body, for the reader.
async function onePost(url: URL, req: Request, ctx: { waitUntil(p: Promise<unknown>): void }): Promise<Response> {
  const id = url.searchParams.get("id") || "";
  if (!/^[A-Za-z0-9]{10,24}$/.test(id)) return new Response("bad id", { status: 400 });
  const cache = (caches as unknown as { default: Cache }).default;
  const hit = await cache.match(req);
  if (hit) return hit;
  const query = `{post(input:{selector:{_id:"${id}"}}){result{_id title postedAt slug baseScore commentCount htmlBody user{displayName}}}}`;
  const up = await fetch(GQL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query }),
  });
  if (!up.ok) return new Response("upstream " + up.status, { status: 502 });
  const data = (await up.json()) as { data?: { post?: { result?: unknown } } };
  const result = data?.data?.post?.result;
  if (!result) return new Response("not found", { status: 404 });
  const res = new Response(JSON.stringify(result), {
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "cache-control": "public, max-age=3600",
    },
  });
  ctx.waitUntil(cache.put(req, res.clone()));
  return res;
}
