// Mounted at bisks.net/bawkchain/ — strips the mount prefix before handing
// the request to the static-asset router, since the assets directory has no
// idea it isn't living at the domain root.
//
// Two dynamic routes:
//
// GET /bawkchain/avatar?u=<cdn.bsky.app avatar url>. The client oil-paints
// winners' avatars on a <canvas>, which needs pixel readback
// (getImageData) — and cdn.bsky.app doesn't send
// Access-Control-Allow-Origin, so a plain crossOrigin="anonymous" <img> load
// fails outright (confirmed against the live CDN, not a guess). Proxying the
// fetch through this same-origin Worker sidesteps that: the browser never
// makes a cross-origin request for the pixel data in the first place.
//
// GET /bawkchain/block/<index>. A plain static page serves the *same*
// og:title/description/url for every block, so sharing any one winner's
// card unfurls as one generic "bawkchain" link forever (same failure mode
// notes/45-sharing-and-virality.md calls out, fixed the same way
// sites/didscope/src/index.ts fixes it for /s/<handle>): resolve the chain
// server-side, find the block, and stamp per-block og:title/description/url
// onto the same page shell before serving it. Reuses the exact chain-build
// logic the client runs (public/lib/chain.js) rather than re-deriving it —
// both fetch() and crypto.subtle work fine in a Worker, so there's nothing
// browser-only in there to duplicate.
import { fetchWinners, buildChain } from "../public/lib/chain.js";

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

const PREFIX = "/bawkchain";
const AVATAR_HOST = "cdn.bsky.app";
const AVATAR_PATH_PREFIX = "/img/avatar/";

const GENERIC_TITLE = "bawkchain — oil paintings of Top Chicken winners, hash-chained";
const GENERIC_META_DESC =
  "Every winner @topchicken.bsky.social has ever crowned, oil-painted from their avatar and minted onto a fully client-side, fully fake, fully reproducible hash chain.";
const GENERIC_OG_DESC =
  "A gallery of Top Chicken winners' avatars, oil-painted and minted block by block onto the bawkchain. Sync your own node — it's just a page load.";
const GENERIC_TWITTER_DESC =
  "A gallery of Top Chicken winners' avatars, oil-painted and minted block by block onto the bawkchain.";
// Quote-delimited on purpose: the bare URL "https://bawkchain.bisks.net/" is
// also a prefix of the og:image/twitter:image value
// ("https://bawkchain.bisks.net/og.png"), so an unquoted split/join would
// clobber the image URL too. Matching through the closing quote keeps it to
// the og:url/canonical occurrence only.
const GENERIC_OG_URL_ATTR = '"https://bawkchain.bisks.net/"';

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      timeZone: "UTC",
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso || "";
  }
}

async function renderBlockShare(env: Env, request: Request, indexStr: string): Promise<Response> {
  const base = await env.ASSETS.fetch(new Request(new URL("/", request.url), { method: "GET" }));
  const html = await base.text();

  const index = Number.parseInt(indexStr, 10);
  if (!Number.isInteger(index) || index < 0) {
    return new Response(html, { headers: base.headers });
  }

  try {
    const winners = await fetchWinners();
    const blocks = await buildChain(winners);
    const block = blocks[index];
    if (!block) {
      // Not a broken link — just an index that doesn't exist (yet, or ever).
      // Serve the live generic shell so the page still works.
      return new Response(html, {
        headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" },
      });
    }

    const who = "@" + block.winner.handle;
    const title = `bawkchain block #${block.index}: ${who} inducted for ${block.likeCount.toLocaleString()} likes`;
    const desc = `${block.winner.displayName} was crowned Top Chicken and inducted into the bawkchain on ${fmtDate(
      block.announcedAt
    )} — hash ${block.hash.slice(0, 16)}…, prev ${block.index === 0 ? "genesis" : block.prevHash.slice(0, 16) + "…"}.`;
    const ogUrl = `https://bawkchain.bisks.net/block/${block.index}`;

    const stamped = html
      .split(GENERIC_OG_DESC)
      .join(esc(desc))
      .split(GENERIC_TWITTER_DESC)
      .join(esc(desc))
      .split(GENERIC_META_DESC)
      .join(esc(desc))
      .split(GENERIC_TITLE)
      .join(esc(title))
      .split(GENERIC_OG_URL_ATTR)
      .join(`"${ogUrl}"`);

    return new Response(stamped, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" },
    });
  } catch {
    // Couldn't resolve the chain server-side (AppView hiccup, rate limit) —
    // still serve the live page so the link isn't dead; the client script
    // does the same sync and will render fine on its own.
    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" },
    });
  }
}

async function proxyAvatar(request: Request, target: string): Promise<Response> {
  let targetUrl: URL;
  try {
    targetUrl = new URL(target);
  } catch {
    return new Response("bad avatar url", { status: 400 });
  }
  // Only ever proxy Bluesky's own avatar CDN — this is not a general-purpose
  // image proxy.
  if (targetUrl.hostname !== AVATAR_HOST || !targetUrl.pathname.startsWith(AVATAR_PATH_PREFIX)) {
    return new Response("avatar url not allowed", { status: 400 });
  }
  const upstream = await fetch(targetUrl.toString(), {
    cf: { cacheTtl: 3600, cacheEverything: true } as unknown as Record<string, unknown>,
  });
  const headers = new Headers(upstream.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Cache-Control", "public, max-age=3600, immutable");
  return new Response(upstream.body, { status: upstream.status, headers });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === PREFIX) {
      url.pathname = PREFIX + "/";
      return Response.redirect(url.toString(), 308);
    }
    if (url.pathname === PREFIX + "/avatar") {
      const target = url.searchParams.get("u");
      if (!target) return new Response("missing ?u=", { status: 400 });
      return proxyAvatar(request, target);
    }
    const blockMatch = /^\/block\/(\d+)\/?$/.exec(url.pathname.slice(PREFIX.length));
    if (blockMatch) return renderBlockShare(env, request, blockMatch[1]);
    // Only strip when the prefix is actually present — on the subdomain
    // requests arrive without it, and an unconditional slice would chop
    // the front off short paths ("/app.js" -> "") so every asset would
    // silently serve index.html.
    if (url.pathname.startsWith(PREFIX + "/")) {
      url.pathname = url.pathname.slice(PREFIX.length) || "/";
    }
    return env.ASSETS.fetch(new Request(url, request));
  },
};
