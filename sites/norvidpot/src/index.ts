// norvidpot Worker — bisks.net/norvidpot
//
// A static page (public/index.html + public/data.json) listing 100 posts by
// @norvid-studies.bsky.social, rewritten as somber Steinbeck-and-Dostoevsky
// pastiche prose, ranked by how many likes the real post got. The data was
// fetched from the public AppView and rewritten once at build time — this
// Worker does no live rewriting, it just strips the /norvidpot mount prefix
// and, for /norvidpot/entry/<rank>, stamps that one entry's text onto the
// shell's OG tags so a shared link unfurls with the actual bit instead of a
// generic card. Same recipe as sites/impostorbel's renderArticle.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

const PREFIX = "/norvidpot";
const SITE_ORIGIN = "https://bisks.net";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function truncate(s: string, n: number): string {
  const clean = s.replace(/\s+/g, " ").trim();
  return clean.length > n ? clean.slice(0, n - 1).trimEnd() + "…" : clean;
}

function injectMeta(
  html: string,
  meta: { title: string; description: string; url: string }
): string {
  return html
    .replace(/<title>[^<]*<\/title>/, `<title>${esc(meta.title)}</title>`)
    .replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${esc(meta.title)}$2`)
    .replace(/(<meta property="og:description" content=")[^"]*(")/, `$1${esc(meta.description)}$2`)
    .replace(/(<meta property="og:url" content=")[^"]*(")/, `$1${esc(meta.url)}$2`)
    .replace(/(<meta name="twitter:title" content=")[^"]*(")/, `$1${esc(meta.title)}$2`)
    .replace(/(<meta name="twitter:description" content=")[^"]*(")/, `$1${esc(meta.description)}$2`);
}

async function shellHtml(env: Env, request: Request): Promise<string> {
  const shellUrl = new URL(request.url);
  shellUrl.pathname = "/";
  const res = await env.ASSETS.fetch(new Request(shellUrl, { headers: request.headers }));
  return res.text();
}

async function renderEntry(env: Env, request: Request, rank: number): Promise<Response> {
  const html = await shellHtml(env, request);
  const dataUrl = new URL(request.url);
  dataUrl.pathname = "/data.json";
  const dataRes = await env.ASSETS.fetch(new Request(dataUrl, request));
  if (!dataRes.ok) return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
  const posts: Array<{ rank: number; original: string; somber: string; likes: number }> = await dataRes.json();
  const post = posts.find((p) => p.rank === rank);
  if (!post) return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });

  const out = injectMeta(html, {
    title: `#${post.rank}: "${truncate(post.original, 70)}" — Norvidpot`,
    description: truncate(post.somber, 220),
    url: `${SITE_ORIGIN}${PREFIX}/entry/${post.rank}`,
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
    // Only strip when the prefix is actually present — on the subdomain
    // requests arrive without it, and an unconditional slice would chop
    // the front off short paths ("/app.js" -> "") so every asset would
    // silently serve index.html.
    const path = url.pathname.startsWith(PREFIX + "/")
      ? url.pathname.slice(PREFIX.length) || "/"
      : url.pathname;

    const entryMatch = path.match(/^\/entry\/(\d+)\/?$/);
    if (entryMatch) return renderEntry(env, request, parseInt(entryMatch[1], 10));

    const assetUrl = new URL(request.url);
    assetUrl.pathname = path;
    return env.ASSETS.fetch(new Request(assetUrl, request));
  },
};
