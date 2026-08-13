// collatz Worker — collatz.bisks.net
//
// The letter itself is entirely client-side (public/app.js does the real
// math and drawing). The one thing that needed a server: shared links. A
// plain static site serves the same og:title/og:description for every
// ?n=<number>, so Bluesky's link-unfurl cache would show one generic card
// forever no matter whose number got professed to — same problem didscope
// solved for handles (see sites/didscope/src/index.ts). /s/<n> is a real,
// distinct URL per number: the Worker recomputes the same hailstone stats
// the client would, server-side, and stamps a personalized
// og:title/og:description/og:url onto the same page shell before serving it.
//
// No network calls needed here (unlike didscope) — it's just arithmetic —
// so this stays a pure function of the path.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

// Mirrors public/app.js's MAX_N / MAX_STEPS — keeps the server-side stats
// (used only for the share-card text) from ever running longer than the
// client would let a real visit run.
const MAX_N = 10n ** 15n;
const MAX_STEPS = 100000;

interface Stats {
  steps: number;
  peak: bigint;
  odds: number;
  evens: number;
}

function collatzStats(start: bigint): Stats | null {
  let n = start;
  let steps = 0;
  let peak = start;
  let odds = 0;
  let evens = 0;
  while (n !== 1n) {
    if (steps >= MAX_STEPS) return null;
    if (n % 2n === 0n) {
      n = n / 2n;
      evens++;
    } else {
      n = 3n * n + 1n;
      odds++;
    }
    if (n > peak) peak = n;
    steps++;
  }
  return { steps, peak, odds, evens };
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmt(n: bigint | number): string {
  return n.toLocaleString("en-US");
}

// Identical across every <title>/og:*/twitter:* tag on the static shell, so
// one string-replace-all each personalizes the whole head — no HTML parser
// needed. See sites/didscope/src/index.ts for the same trick, including the
// GENERIC_OG_URL_ATTR gotcha (match the full quoted attribute, not the bare
// URL, or the og:image URL gets corrupted too since it shares the prefix).
const GENERIC_TITLE = "collatz — a love letter to 3n+1";
const GENERIC_DESC =
  "Give it any number. It will bring your number home to 1, and it will not shut up about it.";
const GENERIC_OG_URL_ATTR = 'content="https://collatz.bisks.net/"';

async function renderShare(env: Env, request: Request, raw: string): Promise<Response> {
  const base = await env.ASSETS.fetch(new Request(new URL("/", request.url), { method: "GET" }));
  let html = await base.text();

  let n: bigint;
  try {
    if (!/^\d+$/.test(raw)) throw new Error("not a number");
    n = BigInt(raw);
    if (n < 1n || n > MAX_N) throw new Error("out of range");
  } catch (_) {
    return new Response(html, { headers: base.headers });
  }

  const stats = collatzStats(n);
  if (!stats) return new Response(html, { headers: base.headers });

  const title = `collatz: my letter to ${fmt(n)}`;
  const desc =
    `${fmt(n)} took ${fmt(stats.steps)} steps to come home to me, climbing as high as ` +
    `${fmt(stats.peak)} along the way. I never doubted it for a second.`;
  const ogUrl = `https://collatz.bisks.net/s/${n.toString()}`;

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

    // /s/<n> — the distinct, shareable, per-number URL. Every number gets
    // its own og:title/description/url, so a link unfurler can't collapse
    // them into one cached card. The client script (public/app.js) also
    // reads the number back out of the path and runs the letter for it on
    // load, so the page itself isn't just a pretty preview.
    const m = url.pathname.match(/^\/s\/(\d+)\/?$/);
    if (m) return renderShare(env, request, m[1]);

    return env.ASSETS.fetch(request);
  },
};
