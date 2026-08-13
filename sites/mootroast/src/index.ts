// mootroast Worker — mootroast.bisks.net
//
// Everything real happens client-side (public/index.html + lib/moots.js):
// load a handle's moots, drop them in the drum roaster, tumble/darken them
// over a timed roast, and report a roast level + tasting note per bean when
// it pops. The one thing that needed a server: shared results. A plain
// static site serves the *same* index.html — same og:title/og:description —
// no matter whose batch got roasted, so Bluesky's link-unfurl cache would
// show one generic card forever (same issue as sites/didscope's
// notes/45-sharing-and-virality.md, tier 4).
//
// Fix: /roast/<selfHandle> is a real, distinct, shareable URL. The batch
// stats (bean count, darkest/lightest roast) are public, non-secret,
// already-computed-client-side numbers, so rather than re-deriving them
// server-side (which would mean re-running the whole random roast) they
// ride along as query params on the share link. The Worker just resolves
// selfHandle's display name and stamps a personalized og:title/description
// onto the page shell — so every shared batch gets its own preview card.
// The client script notices the /roast/ path on load and auto-loads
// selfHandle's moots so the page is live, not just a static card.
//
// Falls through to ASSETS for everything else (/, /og.png, /lib/*, /fonts/*).

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

const PUB = "https://public.api.bsky.app/xrpc/";

async function xrpc(method: string, params: Record<string, string>): Promise<any> {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(PUB + method + (qs ? "?" + qs : ""), {
    cf: { cacheTtl: 60 } as unknown as Record<string, unknown>,
  });
  if (!res.ok) throw new Error(`${method} ${res.status}`);
  return res.json();
}

function cleanHandle(raw: string): string {
  let h = decodeURIComponent(raw || "").trim();
  h = h.replace(/^@/, "");
  const m = h.match(/bsky\.app\/profile\/([^/\s?#]+)/i);
  if (m) h = m[1];
  return h;
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// The static page's meta tags — these exact strings get swapped for the
// personalized versions. Keep in sync with public/index.html's <head>.
const GENERIC_OG_TITLE = "mootroast — a drum roaster for your moots";
const GENERIC_OG_DESC =
  "Load a Bluesky handle's moots into a drum roaster and watch them tumble and darken until they pop — cinnamon to charred, with a tasting note for every bean.";
const GENERIC_TWITTER_DESC =
  "Tumble a handle's moots in a drum roaster until every bean pops with a roast level and a tasting note.";
const GENERIC_OG_URL = "https://mootroast.bisks.net/";

async function renderRoast(env: Env, request: Request, rawSelf: string): Promise<Response> {
  const base = await env.ASSETS.fetch(new Request(new URL("/", request.url), { method: "GET" }));
  let html = await base.text();

  const selfHandle = cleanHandle(rawSelf);
  if (!selfHandle) return new Response(html, { headers: base.headers });

  const url = new URL(request.url);
  const n = parseInt(url.searchParams.get("n") || "", 10);
  const darkHandle = cleanHandle(url.searchParams.get("dark") || "");
  const darkLvl = (url.searchParams.get("darklvl") || "").trim();
  const lightHandle = cleanHandle(url.searchParams.get("light") || "");
  const lightLvl = (url.searchParams.get("lightlvl") || "").trim();
  const charred = parseInt(url.searchParams.get("charred") || "0", 10) || 0;

  try {
    let displayName = selfHandle;
    try {
      const { did } = await xrpc("com.atproto.identity.resolveHandle", { handle: selfHandle });
      const profile = await xrpc("app.bsky.actor.getProfile", { actor: did });
      displayName = profile.displayName || profile.handle || selfHandle;
    } catch {}

    const title =
      Number.isFinite(n) && n > 0
        ? `🔥 mootroast: ${displayName} roasted ${n} moot${n === 1 ? "" : "s"}`
        : `🔥 mootroast: ${displayName}'s batch`;

    let desc: string;
    if (Number.isFinite(n) && n > 0 && darkHandle) {
      const bits = [`ran ${n} of @${selfHandle}'s moots through the drum roaster`];
      if (darkLvl) bits.push(`@${darkHandle} came out ${darkLvl}`);
      if (lightHandle && lightLvl) bits.push(`@${lightHandle} barely cleared ${lightLvl}`);
      if (charred > 0) bits.push(`${charred} didn't survive the second crack`);
      desc = bits.join(" — ") + ".";
    } else {
      desc = `@${selfHandle} put their moots through the drum roaster — see who came out light, who went dark, and who got charred.`;
    }

    const ogUrl = `https://mootroast.bisks.net/roast/${encodeURIComponent(selfHandle)}${url.search}`;

    html = html
      .split(GENERIC_OG_TITLE).join(esc(title))
      .split(GENERIC_OG_DESC).join(esc(desc))
      .split(GENERIC_TWITTER_DESC).join(esc(desc))
      .split(GENERIC_OG_URL).join(ogUrl);

    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" },
    });
  } catch (_) {
    // Couldn't resolve server-side (typo, deleted account, rate limit) —
    // still serve the live page so the link isn't dead; the client script
    // surfaces its own error when it tries the same lookup.
    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" },
    });
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // /roast/<selfHandle>?n=&dark=&darklvl=&light=&lightlvl=&charred= — the
    // distinct, shareable, per-batch URL. Every batch gets its own
    // og:title/description/url so a link unfurler can't collapse different
    // shared batches into one card.
    const m = url.pathname.match(/^\/roast\/([^/]+)\/?$/);
    if (m) return renderRoast(env, request, m[1]);

    return env.ASSETS.fetch(request);
  },
};
