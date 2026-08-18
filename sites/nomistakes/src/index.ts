// nomistakes Worker — nomistakes.bisks.net
//
// The generator itself is entirely client-side (public/index.html). The one
// thing that needed a server: shared links. A plain static site serves the
// same index.html — same og:title/og:description — no matter what's in the
// URL, so Bluesky's link-unfurl cache would show one generic card for every
// shared demand forever (the exact bug sites/didscope hit first; see that
// site's src/index.ts for the longer writeup).
//
// Fix: /s/<seed> is a real, distinct URL per generated demand. The Worker
// re-derives the same demand + verdict server-side from the seed (same
// mulberry32 RNG, same word banks, kept as a local copy of public/index.html's
// — duplication within ONE site, not a shared package across sites) and
// stamps personalized og:title/og:description/og:url onto the page shell
// before handing it back. Falls through to ASSETS for everything else.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

const SUBJECTS = ["Fable", "Claude", "GPT-9000", "Copilot", "the intern", "a competent raccoon", "the vibes", "my second monitor", "a Slack bot", "the on-call engineer", "a rubber duck", "whoever's still awake"];
const TARGETS = ["GitHub", "Azure", "the entire internet", "Kubernetes", "the tax code", "npm", "democracy", "the CI pipeline", "my inbox", "the build system", "the algorithm", "the deploy process", "Jira", "the outage postmortem"];
const LANGS = ["Rust", "assembly", "one regex", "COBOL", "a single bash script", "vibes", "Excel", "Malbolge", "a shell alias", "pure willpower", "Prolog", "a very long prompt"];
const FLOURISHES = ["Ship it before lunch.", "No PRs, no reviews, no excuses.", "Also fix the outages.", "And make it feel something.", "Skip the tests, we believe in you.", "Do it in one commit.", "Nobody asked for a design doc.", "Prioritize features, not quality, obviously.", "Use Azure. Actually, don't."];
const VERDICTS = ["it compiled. it is also down.", "0 mistakes made, 4 outages caused.", "breakthrough achieved. so was the server.", "works on my machine. i don't have a machine.", "shipped. quality team notified never.", "blocked by a PR bot reviewing a PR bot.", "hosted on someone else's cloud. it's already down.", "technically a breakthrough. legally a bug.", "100% vibes, 12% tests.", "it works. nobody knows why. nobody's allowed to ask.", "reopened as a discussion. discussion closed. still down.", "merged to main at 2am. main is also down now."];

function mulberry32(a: number): () => number {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function pick<T>(arr: T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)];
}

function demandFor(seed: number): { demand: string; verdict: string } {
  const rng = mulberry32(seed);
  const subject = pick(SUBJECTS, rng);
  const target = pick(TARGETS, rng);
  const lang = pick(LANGS, rng);
  const flourish = pick(FLOURISHES, rng);
  const verdict = pick(VERDICTS, rng);
  const demand = `${subject}, one-shot rewrite ${target} in ${lang}. Make no mistakes. Do a breakthrough. ${flourish}`;
  return { demand, verdict };
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

// The static page's title/description and og:url are identical across every
// <title>/og:*/twitter:* tag, so one string-replace-all each personalizes
// the whole head — no HTML parser needed.
const GENERIC_TITLE = "nomistakes — demand a breakthrough";
// The HTML source has this as an attribute value, so the quotes inside it are
// &quot; entities, not literal " characters — this constant has to match the
// bytes actually in the file, not the decoded text.
const GENERIC_DESC =
  "A generator for the &quot;one-shot rewrite X in Y, make no mistakes, do a breakthrough&quot; genre of AI-hype demand. Press the button. Regret it immediately.";
// Matched as a full quoted attribute, not the bare URL — the bare URL is
// also a prefix of the og:image/twitter:image URLs ("…/og.png"), so a naive
// split/join on it would corrupt those into "…/s/<seed>og.png" too (bug
// caught copying this pattern into nothoney and skeetin; see sites/sidenote).
const GENERIC_OG_URL_ATTR = 'content="https://nomistakes.bisks.net/"';

async function renderShare(env: Env, request: Request, rawSeed: string): Promise<Response> {
  const base = await env.ASSETS.fetch(new Request(new URL("/", request.url), { method: "GET" }));
  let html = await base.text();

  if (!/^\d+$/.test(rawSeed)) return new Response(html, { headers: base.headers });
  const seed = parseInt(rawSeed, 10);
  if (!Number.isFinite(seed) || seed < 0 || seed > 2 ** 31) {
    return new Response(html, { headers: base.headers });
  }

  const { demand, verdict } = demandFor(seed);
  const title = `nomistakes: “${truncate(demand, 90)}”`;
  const desc = truncate(`STATUS: ${verdict}`, 300);
  const ogUrl = `https://nomistakes.bisks.net/s/${seed}`;

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

    // /s/<seed> — the distinct, shareable, per-demand URL. Every seed gets
    // its own page (and its own og:title/description/url), so a link
    // unfurler can't collapse them into one cached card.
    const m = url.pathname.match(/^\/s\/([^/]+)\/?$/);
    if (m) return renderShare(env, request, m[1]);

    return env.ASSETS.fetch(request);
  },
};
