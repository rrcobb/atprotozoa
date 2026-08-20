// rotcast Worker — rotcast.bisks.net
//
// Everything real happens client-side (public/index.html): fetch the two
// fixed cohosts off the public AppView, book a random live post off
// Jetstream as the "surprise special guest," and generate a transcript
// around it. Two things needed a server:
//
// 1. /e/<ep>/<guestHandle>/<line> — a plain static site serves the *same*
//    index.html no matter what episode got generated, so every share
//    unfurls to one generic card forever (same problem didscope solved for
//    /s/<handle>, this site's lineage). The client already computed the
//    episode before building the share link, so this route does no XRPC
//    calls of its own — just decodes the path and string-replaces the
//    static HTML's generic OG tags before handing it back.
//
// 2. /avatar?u=<cdn.bsky.app URL> — the share-card <canvas> needs to
//    drawImage() each avatar to export it via toBlob()/toDataURL(), which
//    requires the image to load with crossOrigin="anonymous". cdn.bsky.app
//    sends no Access-Control-Allow-Origin header on any image variant
//    (confirmed by hand: curl -I with and without an Origin header, on
//    avatar/avatar_thumbnail/feed_thumbnail, all come back with no
//    access-control-* headers at all) — so a cross-origin crossOrigin
//    request to it always fails, and the "avatar" silently never appears
//    in the exported card. This route re-serves the image same-origin so
//    the browser stops treating it as cross-origin at all. Locked to the
//    cdn.bsky.app host only — it is not a general URL proxy.
//
// Falls through to ASSETS for everything else (/, /og.png).

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

const ALLOWED_IMAGE_HOSTS = new Set(["cdn.bsky.app"]);

async function proxyAvatar(request: Request): Promise<Response> {
  const target = new URL(request.url).searchParams.get("u");
  if (!target) return new Response("missing u", { status: 400 });

  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch (_) {
    return new Response("bad url", { status: 400 });
  }
  if (parsed.protocol !== "https:" || !ALLOWED_IMAGE_HOSTS.has(parsed.hostname)) {
    return new Response("host not allowed", { status: 400 });
  }

  const upstream = await fetch(parsed.toString(), {
    cf: { cacheTtl: 86400, cacheEverything: true } as unknown as Record<string, unknown>,
  });
  if (!upstream.ok || !upstream.body) return new Response("upstream error", { status: 502 });

  return new Response(upstream.body, {
    headers: {
      "content-type": upstream.headers.get("content-type") || "image/jpeg",
      "cache-control": "public, max-age=86400",
      "access-control-allow-origin": "*",
    },
  });
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + "…";
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Must match public/index.html's <title>/og:*/twitter:* text exactly — one
// string-replace-all each personalizes the whole head, no HTML parser needed.
const GENERIC_TITLE = "SHUT UP NERD — a rotcast episode generator";
const GENERIC_DESC =
  "alias and Dr. From The West Meadow co-host. a surprise guest gets kidnapped live off the firehose every episode. generate the transcript.";
// Matched as a full quoted attribute, not the bare URL — the bare URL is
// also a prefix of the og:image/twitter:image URLs ("…/og.png"), so a naive
// split/join on it would corrupt those too (gotcha called out in didscope's
// src/index.ts, this site's lineage).
const GENERIC_OG_URL_ATTR = 'content="https://rotcast.bisks.net/"';

async function renderEpisode(
  env: Env,
  request: Request,
  ep: string,
  rawGuestHandle: string,
  rawLine: string,
): Promise<Response> {
  const base = await env.ASSETS.fetch(new Request(new URL("/", request.url), { method: "GET" }));
  let html = await base.text();

  if (!/^\d+$/.test(ep)) return new Response(html, { headers: base.headers });

  let guestHandle: string, line: string;
  try {
    guestHandle = decodeURIComponent(rawGuestHandle).replace(/^@/, "").trim();
    line = decodeURIComponent(rawLine).trim();
  } catch (_) {
    return new Response(html, { headers: base.headers });
  }
  if (!guestHandle) return new Response(html, { headers: base.headers });

  const title = `rotcast ep. ${ep}: alias & Dr. West Meadow ft. @${guestHandle}`;
  const desc = line
    ? truncate(`Surprise guest @${guestHandle} showed up mid-episode. Their opener: "${line}"`, 300)
    : `Surprise guest @${guestHandle} showed up mid-episode. Generate your own episode of maximum rot.`;
  const ogUrl = `https://rotcast.bisks.net/e/${ep}/${encodeURIComponent(guestHandle)}/${encodeURIComponent(line)}`;

  html = html
    .split(GENERIC_TITLE).join(esc(title))
    .split(GENERIC_DESC).join(esc(desc))
    .split(GENERIC_OG_URL_ATTR).join(`content="${ogUrl}"`);

  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // /e/<ep>/<guestHandle>/<line> — the distinct, shareable, per-episode
    // URL. Every generated episode gets its own page (and its own
    // og:title/description/url), so a link unfurler can't collapse them
    // into one cached card.
    const m = url.pathname.match(/^\/e\/(\d+)\/([^/]+)\/([^/]+)\/?$/);
    if (m) return renderEpisode(env, request, m[1], m[2], m[3]);

    if (url.pathname === "/avatar") return proxyAvatar(request);

    return env.ASSETS.fetch(request);
  },
};
