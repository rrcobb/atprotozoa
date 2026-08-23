// hustlarium Worker — hustlarium.bisks.net
//
// The exhibit itself is entirely client-side (public/index.html draws a
// random specimen card + a canvas share image, no XRPC calls at all — this
// is fiction, not live data). The one thing that needed a server: shared
// links. A plain static site serves the *same* index.html — same generic
// og:title/og:description/og:image — no matter which specimen index is in
// the path, so Bluesky's link-unfurl cache would show one generic card for
// every share, forever (the exact bug reported on didscope by
// @antiali.as / @ver.ooo).
//
// Fix: /s/<n> is a real, distinct URL per specimen. The Worker stamps that
// specimen's own og:title/og:description/og:url onto the same page shell
// before handing it back, so every shared specimen gets its own cache entry
// and its own preview text. Falls through to ASSETS for everything else
// (/, /og.png).

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

// Kept as a local copy of the array in public/index.html — same reasoning as
// didscope's SIGNS duplication: server-side duplication of client data
// within ONE site, not a shared package across sites. Only what the OG text
// needs (common name + the post text) made the trip; the client owns avatar,
// habitat/diet/markings, and the canvas share card. Index in this array IS
// the /s/<n> seed, so it must stay in the same order as the client copy.
const SPECIMENS: { common: string; text: string }[] = [
  { common: "The Serial Pivot-Preneur", text: "🚨 unpopular opinion: if you're still \"reviewing your own code\" in 2026 you've already lost. vibe-shipped a $40k MRR SaaS between two client calls. thread 🧵 1/11" },
  { common: "The Autonomous Layoff Enthusiast", text: "day 212 of building in public: let my last human engineer go this morning. the agent didn't even blink. we are so back 🚀" },
  { common: "The Prompt Whisperer", text: "I don't \"code\" anymore. I whisper intent into the machine and it manifests. 6 products this month. 0 bugs (unconfirmed, haven't checked)" },
  { common: "The Quit-Your-Job Herald", text: "quit my $340k big tech job to vibe-code full time. 11 days in. burned $4k in API credits. best decision I've ever made 🔥🔥🔥" },
  { common: "The Unsupervised Agent Evangelist", text: "PSA: if your startup doesn't have an autonomous agent running unsupervised in prod, you're not serious about building. ship it and pray 🙏" },
  { common: "The Gatekeeping Abolitionist", text: "hot take: \"senior engineer\" was always just a title we invented to gatekeep people who could've asked the model nicely. RIP to my old career, had to be done 💀🚀" },
  { common: "The Overnight Growth Hacker", text: "woke up, vibe-coded a landing page, ran 40 ad variants overnight with an agent, went to bed. this is the unlock nobody's talking about. link in bio" },
  { common: "The Thread-Industrial Complex", text: "reminder: every hour you spend understanding your own codebase is an hour a competitor spent shipping. iterate, don't investigate. 🧵 1/23" },
  { common: "The Recursive Growth Guru", text: "300 followers to 41.2k in 90 days teaching people how I teach people how I got 41.2k followers. full breakdown, DM \"GROWTH\" 📈" },
  { common: "The Post-Literate Founder", text: "you don't need to learn to code. you need to learn to want things loudly enough that the model gives them to you. that's the whole talk 🎤" },
  { common: "The Cap-Table Deregulator", text: "everyone's scared to say it: your \"technical cofounder\" is now just a Cursor subscription and a good prompt. adjust your cap table accordingly" },
  { common: "The 4am Ship-Or-Die Zealot", text: "if you slept 8 hours last night you weren't building. you were resting. there's a difference and only one of us is going to make it 🚀" },
  { common: "The DM-Me-The-System Type", text: "I'm going to be honest with you for free: 99% of you will never DM me \"SYSTEM\" and that's exactly why 99% of you will stay broke 💸" },
  { common: "The Ex-Employee Turned Oracle", text: "6 months ago I had a team, a roadmap, and a manager. now I have an agent, a vision, and freedom. I have never been more certain I made the right call (send help)" },
  { common: "The Founder-Mode Fundamentalist", text: "\"work-life balance\" is a legacy concept invented by people who were never going to build anything anyway. I am typing this from my desk. it is Sunday. it is fine 🚀" },
  { common: "The Benevolent AI Overlord (Self-Appointed)", text: "in 5 years there will be two kinds of people: those who let the agent run the company, and those explaining to their kids why they got left behind. choose wisely 🧠🚀" },
];

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

// The static page's title/description/og:url are each identical across
// every <title>/og:*/twitter:* tag, so one string-replace-all each is enough
// to personalize the whole head — no HTML parser needed.
const GENERIC_TITLE = "the hustlarium — an enclosure for the ai/vibecode hustle bro";
const GENERIC_DESC =
  "Bluesky is mercifully free of this species. Observe one safely, from behind glass, sourced responsibly from the wild (X, formerly Twitter).";
// Matched as a full quoted attribute, not the bare URL — the bare URL is
// also a prefix of the og:image/twitter:image URLs ("…/og.png"), so a naive
// split/join on it would corrupt those into "…/s/<n>og.png" too (the exact
// gotcha noted in sites/didscope/src/index.ts).
const GENERIC_OG_URL_ATTR = 'content="https://hustlarium.bisks.net/"';

function renderShare(html: string, n: number): Response {
  const sp = SPECIMENS[n];
  const title = `hustlarium: ${sp.common}, spotted in the wild`;
  const desc = truncate(`"${sp.text}" — safely viewed from behind glass. ${sp.common}, sourced from X, not seen here.`, 300);
  const ogUrl = `https://hustlarium.bisks.net/s/${n}`;

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

    // /s/<n> — the distinct, shareable, per-specimen URL. Every index gets
    // its own page (and its own og:title/description/url), so a link
    // unfurler can't collapse them into one cached card.
    const m = url.pathname.match(/^\/s\/(\d+)\/?$/);
    if (m) {
      const n = Number(m[1]);
      if (Number.isInteger(n) && SPECIMENS[n]) {
        const base = await env.ASSETS.fetch(new Request(new URL("/", request.url), { method: "GET" }));
        const html = await base.text();
        return renderShare(html, n);
      }
    }

    return env.ASSETS.fetch(request);
  },
};
