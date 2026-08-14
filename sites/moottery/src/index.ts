// moottery Worker — served at the root of moottery.bisks.net. The game
// itself (pulling each suspect's real posts, redacting evidence, running the
// case) is entirely client-side in public/ — see public/lib/case-data.js.
// Copied from sites/whodatninja/src/index.ts (copy, don't abstract); this
// Worker has the same two jobs:
//
// 1. /img?u=<cdn.bsky.app avatar url> — a narrow CORS proxy for avatar
//    images. cdn.bsky.app sends no Access-Control-Allow-Origin header, so
//    drawing an avatar onto the share-card <canvas> taints it and
//    canvas.toBlob()/toDataURL() throw. Re-fetching the same bytes through
//    this Worker and adding an open CORS header fixes that.
//
// 2. /s/<handle1>,<handle2>,... — a distinct, shareable URL per case (see
//    notes/45-sharing-and-virality.md, tier 4): stamps a personalized
//    title/description onto the same static shell before serving it. The
//    client's own script also matches this path and rebuilds the actual
//    case (same suspects → same deterministic solution), so this only needs
//    to know the handle list, not fetch posts.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

const AVATAR_HOST = "cdn.bsky.app";
const AVATAR_PATH_RE = /^\/img\/avatar(_thumbnail)?\/plain\/did:[a-z0-9:%._-]+\/[a-z0-9]+(@[a-z]+)?$/i;

const MIN_SUSPECTS = 3;
const MAX_SUSPECTS = 6;

function cleanHandle(raw: string): string {
  let h = decodeURIComponent(raw).trim();
  h = h.replace(/^@/, "");
  const m = h.match(/bsky\.app\/profile\/([^/\s?#]+)/i);
  if (m) h = m[1];
  return h;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

async function renderShare(env: Env, request: Request, rawList: string): Promise<Response> {
  const base = await env.ASSETS.fetch(new Request(new URL("/", request.url), { method: "GET" }));
  let html = await base.text();

  const handles = rawList
    .split(",")
    .map(cleanHandle)
    .filter(Boolean)
    .slice(0, MAX_SUSPECTS);
  if (handles.length < MIN_SUSPECTS) return new Response(html, { headers: base.headers });

  const who = handles.map((h) => "@" + h).join(", ");
  const title = `moottery: who wrote it — ${who}`;
  const desc = `A real, redacted quote from one of ${handles.length} suspects (${who}). It gets a little more legible each round — guess who wrote it before the last redaction lifts.`;
  const url = `https://moottery.bisks.net/s/${handles.map(encodeURIComponent).join(",")}`;

  html = html
    .replace(/<title>.*?<\/title>/, `<title>${esc(title)} — moottery</title>`)
    .replace(/(<meta name="description" content=")[^"]*(")/, `$1${esc(desc)}$2`)
    .replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${esc(title)}$2`)
    .replace(/(<meta property="og:description" content=")[^"]*(")/, `$1${esc(desc)}$2`)
    .replace(/(<meta property="og:url" content=")[^"]*(")/, `$1${esc(url)}$2`)
    .replace(/(<meta name="twitter:title" content=")[^"]*(")/, `$1${esc(title)}$2`)
    .replace(/(<meta property="twitter:description" content=")[^"]*(")/, `$1${esc(desc)}$2`);

  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" },
  });
}

async function proxyAvatar(rawUrl: string | null): Promise<Response> {
  if (!rawUrl) return new Response("missing u", { status: 400 });
  let target: URL;
  try {
    target = new URL(rawUrl);
  } catch {
    return new Response("bad url", { status: 400 });
  }
  if (target.protocol !== "https:" || target.host !== AVATAR_HOST || !AVATAR_PATH_RE.test(target.pathname)) {
    return new Response("url not allowed", { status: 400 });
  }

  const upstream = await fetch(target.toString(), { cf: { cacheTtl: 86400, cacheEverything: true } as unknown as Record<string, unknown> });
  const headers = new Headers();
  headers.set("content-type", upstream.headers.get("content-type") || "image/jpeg");
  headers.set("access-control-allow-origin", "*");
  // Avatar blobs are content-addressed (the CID is in the path) — safe to
  // cache hard.
  headers.set("cache-control", "public, max-age=604800, immutable");
  return new Response(upstream.body, { status: upstream.status, headers });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/img") {
      return proxyAvatar(url.searchParams.get("u"));
    }

    const shareMatch = url.pathname.match(/^\/s\/([^/]+)\/?$/);
    if (shareMatch) {
      return renderShare(env, request, shareMatch[1]);
    }

    return env.ASSETS.fetch(request);
  },
};
