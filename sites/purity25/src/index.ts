// purity25 Worker — purity25.bisks.net
//
// The quiz itself runs entirely client-side (public/index.html). The one
// thing that needed a server: shared results. A plain static site serves the
// same index.html — same og:title/og:description — no matter what score is
// in the URL, so Bluesky's link-unfurl cache would show one generic card for
// every share. Fix: /s/<score> is a real, distinct URL per score. The Worker
// computes the same tier the client does and stamps a personalized
// og:title/og:description/og:url onto the same page shell — see
// sites/didscope/src/index.ts for the reference pattern this copies.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

// Kept as a local copy of the tier table in public/index.html — same
// reasoning as sites/didscope/src/index.ts: server-side duplication of
// client data within ONE site, not a shared package across sites.
const TIERS: Array<[number, string, string]> = [
  [15, "hopelessly offline", "didn't recognize a single name off Rolling Stone's real 2026 list."],
  [35, "heard the names, not the people", "a few rang a bell. most didn't."],
  [55, "aware, no further characterization needed", "solid middle-of-the-feed knowledge."],
  [75, "extremely online", "actually watches these people. concerning, in a good way."],
  [100, "certified brainrot honors graduate", "certifiable superfan energy across the board."],
];
function tierFor(score: number): [string, string] {
  for (const [max, label, line] of TIERS) if (score <= max) return [label, line];
  return TIERS[TIERS.length - 1].slice(1) as [string, string];
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const GENERIC_TITLE = "purity25 — the Rolling Stone top 25 purity test";
const GENERIC_DESC =
  "Rate how well you actually know Rolling Stone's real 2026 top-25 creator list, get scored on how in (or out of) touch you are, then read our own bios of every name on it.";
const GENERIC_OG_URL_ATTR = 'content="https://purity25.bisks.net/"';

async function renderShare(env: Env, request: Request, rawScore: string): Promise<Response> {
  const base = await env.ASSETS.fetch(new Request(new URL("/", request.url), { method: "GET" }));
  let html = await base.text();

  const score = Math.max(0, Math.min(100, parseInt(rawScore, 10)));
  if (!Number.isFinite(score)) return new Response(html, { headers: base.headers });

  const [label, line] = tierFor(score);
  const title = `purity25: ${score}/100 — ${label}`;
  const desc = `I scored ${score}/100 on the Rolling Stone top-25 purity test: ${line} Take it yourself.`;
  const ogUrl = `https://purity25.bisks.net/s/${score}`;

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

    // /s/<score> — the distinct, shareable, per-result URL. Every score gets
    // its own page (and its own og:title/description/url), so a link
    // unfurler can't collapse them into one cached card.
    const m = url.pathname.match(/^\/s\/(\d{1,3})\/?$/);
    if (m) return renderShare(env, request, m[1]);

    return env.ASSETS.fetch(request);
  },
};
