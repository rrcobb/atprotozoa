// threadriver Worker — threadriver.bisks.net
//
// The whole thread walk and sankey render happen client-side (public/app.js).
// The one thing that needs a server: shared links. A plain static site
// serves the same index.html — same og:title/og:description/og:url — no
// matter which thread is in the URL, so every shared link unfurls as one
// generic card forever. Same fix as sites/didscope/src/index.ts: /s/<did>/
// <rkey> is a real, distinct URL per thread (the client itself normalizes
// to this path via history.replaceState once it resolves a thread's true
// root — see app.js's `run()`), and this Worker fetches just enough of that
// thread server-side to stamp a real title/description onto the same shell
// before serving it.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

const APPVIEW = "https://public.api.bsky.app/xrpc/";

async function xrpc(method: string, params: Record<string, string>): Promise<any> {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(APPVIEW + method + (qs ? "?" + qs : ""), {
    cf: { cacheTtl: 60 } as unknown as Record<string, unknown>,
  });
  if (!res.ok) throw new Error(`${method} ${res.status}`);
  return res.json();
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1).trimEnd() + "…";
}

// Every <title>/og:*/twitter:* generic string in index.html is identical, so
// one string-replace-all each personalizes the whole head — no HTML parser
// needed. GENERIC_OG_URL_ATTR is matched as a full quoted attribute (not the
// bare URL) because the bare URL is also a prefix of the og:image URL — see
// didscope's src/index.ts for the outage that taught us that the hard way.
const GENERIC_TITLE = "threadriver — a Bluesky thread, drawn as a giant sankey";
const GENERIC_DESC =
  "Paste a Bluesky post link and threadriver climbs to the root of its thread, then draws every reply as one big sankey diagram — flow width shows how much of the conversation moves through each branch.";
const GENERIC_OG_URL_ATTR = 'content="https://threadriver.bisks.net/"';

// A minimal, non-recursive count of the reply tree just for the OG blurb —
// depth capped by the AppView's own max (1000), not an invented limit, same
// as the client's fetchThread. Blocked/deleted branches just don't add to
// the count; good enough for a preview number, the client does the real walk.
function countPosts(thread: any): number {
  if (!thread || thread.$type !== "app.bsky.feed.defs#threadViewPost") return 0;
  let n = 1;
  for (const r of thread.replies || []) n += countPosts(r);
  return n;
}
function maxDepthOf(thread: any, depth = 0): number {
  if (!thread || thread.$type !== "app.bsky.feed.defs#threadViewPost") return depth - 1;
  let m = depth;
  for (const r of thread.replies || []) m = Math.max(m, maxDepthOf(r, depth + 1));
  return m;
}

async function renderShare(env: Env, request: Request, did: string, rkey: string): Promise<Response> {
  const base = await env.ASSETS.fetch(new Request(new URL("/", request.url), { method: "GET" }));
  let html = await base.text();

  try {
    const uri = `at://${did}/app.bsky.feed.post/${rkey}`;
    const data = await xrpc("app.bsky.feed.getPostThread", { uri, depth: "1000", parentHeight: "0" });
    const thread = data.thread;
    if (!thread || thread.$type !== "app.bsky.feed.defs#threadViewPost") throw new Error("not a post");

    const author = thread.post.author;
    const who = "@" + (author.handle || did);
    const posts = countPosts(thread);
    const depth = Math.max(0, maxDepthOf(thread));

    const title = `threadriver: ${who}'s thread, mapped as a river`;
    const desc = truncate(
      `${posts.toLocaleString()} posts, ${depth.toLocaleString()} replies deep, all flowing out of one post — see the whole shape of the conversation on threadriver.`,
      300,
    );
    const ogUrl = `https://threadriver.bisks.net/s/${did}/${rkey}`;

    html = html
      .split(GENERIC_TITLE).join(esc(title))
      .split(GENERIC_DESC).join(esc(desc))
      .split(GENERIC_OG_URL_ATTR).join(`content="${ogUrl}"`);

    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" },
    });
  } catch (_) {
    // Couldn't resolve it server-side (deleted, blocked, rate-limited) —
    // still serve the live page so the link isn't dead; the client script
    // surfaces its own error when it tries the same fetch.
    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" },
    });
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // /s/<did>/<rkey> — the distinct, shareable, per-thread URL. Always keyed
    // on the thread's true root (the client resolves up to it before writing
    // this path), so different posts within the same thread share one card.
    const m = url.pathname.match(/^\/s\/(did:[^/]+)\/([^/]+)\/?$/);
    if (m) return renderShare(env, request, m[1], m[2]);

    return env.ASSETS.fetch(request);
  },
};
