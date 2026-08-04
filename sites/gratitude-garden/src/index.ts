// gratitude garden Worker — gratitude-garden.bisks.net
//
// Planting a flower and tending the garden all happen client-side (see
// public/index.html — localStorage owns the garden). The one thing that
// needed a server: a bouquet's share link is just a base64url blob of its
// flowers baked into the URL path (/b/<code>), and a plain static page serves
// the *same* og:title/og:description no matter what's encoded there — so
// every bouquet anyone shares would unfurl as one generic card forever (the
// same bug called out in sites/didscope's src/index.ts for /s/<handle>).
//
// Fix: decode the bouquet server-side, stamp its flowers/messages into
// og:title/og:description/og:url on the same page shell, and let the client
// script do the identical decode to render the bouquet interactively.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

// Kept as a local copy of the FLOWERS table in public/index.html — server-side
// duplication within ONE site, not a shared package across sites (same
// reasoning as sites/didscope's SIGNS table). Only the emoji is needed here.
const FLOWERS: Record<string, string> = {
  b: "🌸",
  s: "🌻",
  r: "🌹",
  t: "🌷",
  d: "🌼",
  l: "🪷",
  h: "🪻",
  m: "🌺",
};

interface BouquetFlower {
  t: string;
  m: string;
}

function b64urlDecode(str: string): string {
  let b64 = str.replace(/-/g, "+").replace(/_/g, "/");
  while (b64.length % 4) b64 += "=";
  return decodeURIComponent(escape(atob(b64)));
}

function decodeBouquet(code: string): BouquetFlower[] | null {
  try {
    const arr = JSON.parse(b64urlDecode(code));
    if (!Array.isArray(arr) || !arr.length) return null;
    const out: BouquetFlower[] = [];
    for (const item of arr.slice(0, 12)) {
      if (!item || typeof item.m !== "string" || !item.m.trim()) continue;
      out.push({
        t: typeof item.t === "string" && FLOWERS[item.t] ? item.t : "b",
        m: item.m.slice(0, 200),
      });
    }
    return out.length ? out : null;
  } catch (_) {
    return null;
  }
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

// The static page's title/description/url phrases are identical across every
// <title>/og:*/twitter:* tag, so one string-replace-all each personalizes the
// whole head — no HTML parser needed, same trick as sites/didscope.
const GENERIC_TITLE = "gratitude garden — grow a bouquet out of kind words";
const GENERIC_DESC =
  "Plant a flower with a kind word, tend a small garden, and send someone a bouquet built entirely out of appreciation.";
const GENERIC_OG_URL = "https://gratitude-garden.bisks.net/";

async function renderBouquet(env: Env, request: Request, code: string): Promise<Response> {
  const base = await env.ASSETS.fetch(new Request(new URL("/", request.url), { method: "GET" }));
  let html = await base.text();

  const flowers = decodeBouquet(code);
  if (!flowers) {
    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" },
    });
  }

  const emojis = flowers.map((f) => FLOWERS[f.t] || "🌸").join("");
  const title = `${emojis} a bouquet grown for you — gratitude garden`;
  const desc = truncate(flowers.map((f) => f.m).join(" · "), 280);
  const ogUrl = `https://gratitude-garden.bisks.net/b/${encodeURIComponent(code)}`;

  html = html
    .split(GENERIC_TITLE).join(esc(title))
    .split(GENERIC_DESC).join(esc(desc))
    .split(GENERIC_OG_URL).join(ogUrl);

  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // /b/<code> — a distinct, shareable URL per bouquet, so a link-unfurl
    // cache can't collapse every share into one generic card.
    const m = url.pathname.match(/^\/b\/([^/]+)\/?$/);
    if (m) return renderBouquet(env, request, m[1]);

    return env.ASSETS.fetch(request);
  },
};
