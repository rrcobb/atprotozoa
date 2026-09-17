// unread Worker — unread.bisks.net
//
// The whole thing runs client-side (public/app.js): connect to Jetstream,
// carve up a canvas with a space-filling binary partition, hand each real
// post its own tile until the canvas runs out of room to give, then start
// layering new posts over old tiles instead. The one thing that needed a
// server: shared links. A plain static site serves the same index.html —
// same og:title/og:description — no matter how many posts your session
// absorbed, so a share would show one generic card forever no matter when
// you shared it (same problem sites/nextbigthing and sites/didscope solved).
// Fix: /s/<count>/<seconds> is a real, distinct URL per session snapshot.
// The Worker stamps the count and duration into the page's og tags before
// handing it back. Falls through to ASSETS for everything else.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
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

function fmtDuration(sec: number): string {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

const GENERIC_TITLE = "unread — a space-filling stream of information you'll never read";
const GENERIC_DESC =
  "Live Bluesky posts pour into a canvas, each claiming a shrinking tile of space, until there's no room left and they start burying each other. Endlessly expanding beyond anyone's capacity to comprehend it.";
// Matched as a full quoted attribute, not the bare URL — the bare URL is also
// a prefix of the og:image/twitter:image URLs ("…/og.png"), so a naive
// split/join on it would corrupt those too (gotcha called out in
// sites/nextbigthing/src/index.ts, sites/didscope/src/index.ts).
const GENERIC_OG_URL_ATTR = 'content="https://unread.bisks.net/"';

async function renderShare(env: Env, request: Request, rawCount: string, rawSeconds: string): Promise<Response> {
  const base = await env.ASSETS.fetch(new Request(new URL("/", request.url), { method: "GET" }));
  let html = await base.text();

  const count = parseInt(rawCount, 10);
  const seconds = parseInt(rawSeconds, 10);
  if (!Number.isFinite(count) || count < 0 || !Number.isFinite(seconds) || seconds < 0) {
    return new Response(html, { headers: base.headers });
  }

  const title = `unread: ${count} posts I will never read`;
  const desc = truncate(
    `${count} real posts poured into this in ${fmtDuration(seconds)}, each one shrinking the space left for the next. that's the whole site — a stream you cannot keep up with, on purpose.`,
    300,
  );
  const ogUrl = `https://unread.bisks.net/s/${count}/${seconds}`;

  html = html
    .split(GENERIC_TITLE).join(esc(title))
    .split(GENERIC_DESC).join(esc(desc))
    .split(GENERIC_OG_URL_ATTR).join(`content="${ogUrl}"`);

  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=60" },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // /s/<count>/<seconds> — the distinct, shareable, per-session URL. Every
    // share gets its own link (and its own og:title/description), so a link
    // unfurler can't collapse every share into one cached card.
    const m = url.pathname.match(/^\/s\/([^/]+)\/([^/]+)\/?$/);
    if (m) return renderShare(env, request, m[1], m[2]);

    return env.ASSETS.fetch(request);
  },
};
