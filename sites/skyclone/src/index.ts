// skyclone Worker — bisks.net/skyclone
//
// The whole client is a static SPA (public/index.html + app.js) that talks
// straight to the public AppView (public.api.bsky.app) from the browser — no
// server-side proxy for feeds/profiles/threads, since that API is open-read
// and CORS-open (access-control-allow-origin: *).
//
// Two jobs live in this Worker instead:
//
// 1. SPA fallback: bsky.app-style deep links (/profile/handle,
//    /profile/handle/post/rkey, /search, ...) are client-router paths with no
//    matching static file. A direct load or refresh on one of those needs to
//    get index.html, not a 404 — so any non-asset path falls through to the
//    shell.
// 2. Per-profile / per-post OG tags: a bare static index.html serves the same
//    og:title/description/image for every /profile/<handle> URL, so
//    Bluesky's own link-unfurl cache would show one generic "skyclone" card
//    no matter whose profile got shared. Fetches the real profile/post
//    server-side and stamps personalized meta tags onto the same shell before
//    handing it back — same recipe as sites/didscope's renderShare.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

const PREFIX = "/skyclone";
const APPVIEW = "https://public.api.bsky.app";
const SITE_ORIGIN = "https://bisks.net";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Truncate on a grapheme-ish boundary for a meta description; doesn't need to
// be exact, just not mid-surrogate-pair.
function truncate(s: string, n: number): string {
  const clean = s.replace(/\s+/g, " ").trim();
  return clean.length > n ? clean.slice(0, n - 1).trimEnd() + "…" : clean;
}

async function bskyGet(path: string, params: Record<string, string>): Promise<any> {
  const url = new URL(`${APPVIEW}/xrpc/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString(), { headers: { accept: "application/json" } });
  if (!res.ok) return null;
  return res.json();
}

async function shellHtml(env: Env, request: Request): Promise<string> {
  const shellUrl = new URL(request.url);
  shellUrl.pathname = "/";
  const res = await env.ASSETS.fetch(new Request(shellUrl, { headers: request.headers }));
  return res.text();
}

function injectMeta(
  html: string,
  meta: { title: string; description: string; image: string; url: string }
): string {
  return html
    .replace(/<title>[^<]*<\/title>/, `<title>${esc(meta.title)}</title>`)
    .replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${esc(meta.title)}$2`)
    .replace(/(<meta property="og:description" content=")[^"]*(")/, `$1${esc(meta.description)}$2`)
    .replace(/(<meta property="og:image" content=")[^"]*(")/, `$1${esc(meta.image)}$2`)
    .replace(/(<meta property="og:url" content=")[^"]*(")/, `$1${esc(meta.url)}$2`)
    .replace(/(<meta name="twitter:title" content=")[^"]*(")/, `$1${esc(meta.title)}$2`)
    .replace(/(<meta name="twitter:description" content=")[^"]*(")/, `$1${esc(meta.description)}$2`)
    .replace(/(<meta name="twitter:image" content=")[^"]*(")/, `$1${esc(meta.image)}$2`);
}

async function renderProfile(env: Env, request: Request, handle: string): Promise<Response> {
  const html = await shellHtml(env, request);
  const profile = await bskyGet("app.bsky.actor.getProfile", { actor: handle });
  if (!profile) return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });

  const name = profile.displayName ? `${profile.displayName} (@${profile.handle})` : `@${profile.handle}`;
  const desc = profile.description
    ? truncate(profile.description, 200)
    : `${profile.followersCount ?? 0} followers · ${profile.followsCount ?? 0} following · ${profile.postsCount ?? 0} posts`;

  const out = injectMeta(html, {
    title: `${name} — skyclone`,
    description: desc,
    image: profile.avatar || `${SITE_ORIGIN}${PREFIX}/og.png`,
    url: `${SITE_ORIGIN}${PREFIX}/profile/${encodeURIComponent(profile.handle)}`,
  });
  return new Response(out, { headers: { "content-type": "text/html; charset=utf-8" } });
}

async function renderPost(env: Env, request: Request, handle: string, rkey: string): Promise<Response> {
  const html = await shellHtml(env, request);
  const profile = await bskyGet("app.bsky.actor.getProfile", { actor: handle });
  if (!profile) return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });

  const uri = `at://${profile.did}/app.bsky.feed.post/${rkey}`;
  const thread = await bskyGet("app.bsky.feed.getPostThread", { uri, depth: "0" });
  const post = thread?.thread?.post;
  const name = profile.displayName ? `${profile.displayName} (@${profile.handle})` : `@${profile.handle}`;
  const text = post?.record?.text ? truncate(post.record.text, 220) : `A post by ${name} on skyclone.`;
  const image =
    post?.embed?.images?.[0]?.thumb ||
    post?.embed?.media?.images?.[0]?.thumb ||
    profile.avatar ||
    `${SITE_ORIGIN}${PREFIX}/og.png`;

  const out = injectMeta(html, {
    title: `${name}: "${text.length > 80 ? text.slice(0, 80) + "…" : text}"`,
    description: text,
    image,
    url: `${SITE_ORIGIN}${PREFIX}/profile/${encodeURIComponent(profile.handle)}/post/${encodeURIComponent(rkey)}`,
  });
  return new Response(out, { headers: { "content-type": "text/html; charset=utf-8" } });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === PREFIX) {
      url.pathname = PREFIX + "/";
      return Response.redirect(url.toString(), 308);
    }
    const path = url.pathname.slice(PREFIX.length) || "/";

    const postMatch = path.match(/^\/profile\/([^/]+)\/post\/([^/]+)\/?$/);
    if (postMatch) return renderPost(env, request, decodeURIComponent(postMatch[1]), decodeURIComponent(postMatch[2]));

    const profileMatch = path.match(/^\/profile\/([^/]+)\/?$/);
    if (profileMatch) return renderProfile(env, request, decodeURIComponent(profileMatch[1]));

    // Static assets (JS, CSS, images, the shell itself) live here. The
    // assets directory has no idea it isn't living at the domain root, so it
    // gets the PREFIX-stripped path, not the original one.
    const assetUrl = new URL(request.url);
    assetUrl.pathname = path;
    const res = await env.ASSETS.fetch(new Request(assetUrl, request));
    if (res.status !== 404) return res;

    // SPA fallback: any other client-router path (/search, /feeds, /profile/x/follows,
    // a stray refresh mid-navigation) gets the shell; app.js takes it from there.
    if (!path.includes(".")) {
      const shellUrl = new URL(request.url);
      shellUrl.pathname = "/";
      return env.ASSETS.fetch(new Request(shellUrl, request));
    }
    return res;
  },
};
