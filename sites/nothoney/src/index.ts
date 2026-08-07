// The meme itself is still drawn entirely client-side onto a <canvas> from a
// public getPostThread lookup (public/app.js + public/lib/meme.js). The one
// thing that needed a server: shared links. A plain static site serves the
// *same* og:title/og:description/og:url no matter which post is in the query
// string, so Bluesky's link-unfurl cache shows one generic "fancy pooh + FOR
// YOU jar" card forever, no matter whose skeet someone remixed — same problem
// notes/45-sharing-and-virality.md documents for didscope.
//
// Fix: /s/<handle>/<rkey> is a real, distinct URL per post (same shape as the
// bsky.app permalink it mirrors). The Worker resolves the post server-side and
// stamps a personalized title/description/url onto the same page shell before
// serving it — so every remix gets its own cache entry. The og:image itself
// stays the static generic og.png (a per-post rendered PNG would need a canvas
// impl that runs in the Workers runtime, which nothing in this repo has yet);
// the payoff here is the title/description carrying the actual quoted text.
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

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + "…";
}

// Mirrors public/app.js's describeEmbed/captionFor — a lot of skeets have no
// text at all (image posts, link shares, bare quote posts), and an empty
// og:description reads as broken. Same fallback chain: alt text, then embed
// kind, so a shared image-only post still unfurls with something real.
function describeEmbed(embed: any): string {
  if (!embed) return "";
  switch (embed.$type) {
    case "app.bsky.embed.images#view": {
      const imgs = embed.images || [];
      const alt = imgs.map((i: any) => i.alt).find((a: string) => a && a.trim());
      if (alt) return `[image: ${alt.trim()}]`;
      return imgs.length > 1 ? "[posted images, no caption]" : "[posted an image, no caption]";
    }
    case "app.bsky.embed.video#view":
      return embed.alt && embed.alt.trim() ? `[video: ${embed.alt.trim()}]` : "[posted a video, no caption]";
    case "app.bsky.embed.external#view":
      return `[link: ${embed.external?.title || embed.external?.uri || "shared link"}]`;
    case "app.bsky.embed.record#view": {
      const qa = embed.record?.author?.handle;
      const qt = embed.record?.value?.text;
      if (qt && qt.trim()) return `[quoting @${qa}: "${qt.trim()}"]`;
      return qa ? `[quote-posted @${qa}]` : "[quote post]";
    }
    case "app.bsky.embed.recordWithMedia#view":
      return describeEmbed(embed.media) || describeEmbed(embed.record);
    default:
      return "";
  }
}

function captionFor(post: any): string {
  const text = String(post.record?.text || "").trim();
  if (text) return text;
  return describeEmbed(post.embed) || "(said nothing at all)";
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// The static shell's title/description/url appear verbatim in a handful of
// tags — plain-quoted in <title>, HTML-entity-quoted in og:*/twitter:* — so a
// couple of string-replace-alls personalize the whole head, no HTML parser.
const GENERIC_TITLE_PLAIN = `nothoney — that's not "for you"`;
const GENERIC_TITLE_ESC = `nothoney — that's not &quot;for you&quot;`;
const GENERIC_DESC_LONG =
  "Paste a Bluesky post link. Get Winnie-the-Pooh explaining that no, actually, you're scrolling Discover — with the actual skeet in his speech bubble.";
const GENERIC_DESC_SHORT =
  "Paste a Bluesky post link. Get Winnie-the-Pooh explaining that no, actually, you're scrolling Discover.";
// Matched as the full quoted attribute value, not a bare URL substring — the
// bare root "https://nothoney.bisks.net/" is also a prefix of the og:image /
// twitter:image URLs ("…/og.png"), and a naive split().join() on it corrupts
// those into "…/s/<handle>/<rkey>og.png" as a side effect.
const GENERIC_OG_URL_ATTR = `content="https://nothoney.bisks.net/"`;

async function renderShare(env: Env, request: Request, rawHandle: string, rkey: string): Promise<Response> {
  const base = await env.ASSETS.fetch(new Request(new URL("/", request.url), { method: "GET" }));
  let html = await base.text();

  const handle = decodeURIComponent(rawHandle).trim().replace(/^@/, "");
  if (!handle || !rkey) return new Response(html, { headers: base.headers });

  try {
    let did = handle;
    if (!did.startsWith("did:")) {
      const r = await xrpc("com.atproto.identity.resolveHandle", { handle });
      did = r.did;
    }
    const atUri = `at://${did}/app.bsky.feed.post/${rkey}`;
    const t = await xrpc("app.bsky.feed.getPostThread", { uri: atUri, depth: "0" });
    const post = t?.thread?.post;
    if (!post) throw new Error("no such post");

    const authorHandle = post.author?.handle || handle;
    const text = captionFor(post);

    const title = `nothoney: @${esc(authorHandle)} got the "for you" treatment`;
    const titleEsc = `nothoney: @${esc(authorHandle)} got the &quot;for you&quot; treatment`;
    const desc = truncate(`Fancy Pooh says it's "for you." Actual receipts: "${text}" — @${authorHandle}`, 300);
    const ogUrl = `https://nothoney.bisks.net/s/${encodeURIComponent(handle)}/${encodeURIComponent(rkey)}`;

    html = html
      .split(GENERIC_TITLE_PLAIN).join(title)
      .split(GENERIC_TITLE_ESC).join(titleEsc)
      .split(GENERIC_DESC_LONG).join(esc(desc))
      .split(GENERIC_DESC_SHORT).join(esc(truncate(desc, 200)))
      .split(GENERIC_OG_URL_ATTR).join(`content="${ogUrl}"`);

    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" },
    });
  } catch (_) {
    // Couldn't resolve the post server-side (deleted, typo, rate limit) —
    // still serve the live page so the link isn't dead; the client script
    // will pick the ?u=/path-derived URL back up and surface its own error.
    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" },
    });
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // /s/<handle>/<rkey> — the distinct, shareable, per-post URL. Mirrors the
    // bsky.app/profile/<handle>/post/<rkey> shape it's built from.
    const m = url.pathname.match(/^\/s\/([^/]+)\/([^/]+)\/?$/);
    if (m) return renderShare(env, request, m[1], m[2]);

    return env.ASSETS.fetch(request);
  },
};
