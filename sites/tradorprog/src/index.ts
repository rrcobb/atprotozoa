// tradorprog Worker — tradorprog.bisks.net
//
// The quiz, the gauge, and the verdict all run client-side
// (public/index.html). The one thing that needed a server: shared verdicts.
// A plain static site serves the same index.html — same og:title/description
// — no matter which verdict you landed on, so a link-unfurl cache would show
// one generic card for every share, forever (same problem/fix as
// fortunejar's /f/<id> — see its src/index.ts).
//
// Fix: /v/<answerMask> is a real, distinct URL per verdict (a 6-bit mask,
// 0-63, one bit per question). The Worker recomputes the same tally +
// verdict the client would compute from that id and stamps them into the
// page's og:title/description/url before handing it back. Falls through to
// ASSETS for everything else.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

// Kept as a local copy of the tables in public/index.html — same reasoning
// as fortunejar's src/index.ts: server-side duplication within ONE site, not
// a shared package across sites. The id encodes a bitmask over THIS exact
// question order, so the two copies must stay in sync if either is edited.
const QUESTION_COUNT = 6;

const VERDICTS: Record<number, { headline: string; blurb: string }> = {
  0: { headline: "certified trad", blurb: "six for six. you are the plain worker and the plain worker is you. stay exactly where you are — rook can wait, rookery can wait, the thermals can go on without you." },
  1: { headline: "trad, mostly", blurb: "one toe dipped in ecosystem water, five feet planted in your own repo. reasonable. maybe reread the rook post someday, no rush." },
  2: { headline: "trad-leaning", blurb: "you'll adopt tooling eventually — once it's survived a few point releases without your help. fine strategy. boring is a compliment here." },
  3: { headline: "dead even", blurb: "three and three. genuinely can't call this one — you contain both the person who duct-tapes a worker together at midnight and the person who'd request a rook invite. hold that tension." },
  4: { headline: "prog-curious", blurb: "more yes than no. get a rook on the commons, kick the tires, see what breaks. you're closer to migrating than you're willing to admit." },
  5: { headline: "mostly prog", blurb: "one stubborn trad answer left. request the invite. tell your worker it's not personal." },
  6: { headline: "certified prog", blurb: "six for six the other way. migrate everything, wire it all together, let someone else run the thermals. cool-kid cred: acquired." },
};

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

const GENERIC_TITLE = "trad or prog — an oracle for the eternal shipping question";
const GENERIC_DESC =
  "Six forced-choice questions. One verdict: stay trad (keep running the plain worker you already have) or go prog (plug into ecosystem tooling like rook). Sparked by a reply about @solpbc.org's rook.";
const GENERIC_OG_URL = "https://tradorprog.bisks.net/";

async function renderShare(env: Env, request: Request, id: string): Promise<Response> {
  const base = await env.ASSETS.fetch(new Request(new URL("/", request.url), { method: "GET" }));
  let html = await base.text();

  const n = parseInt(id, 10);
  if (!Number.isFinite(n) || n < 0 || n > (1 << QUESTION_COUNT) - 1) {
    return new Response(html, { headers: base.headers });
  }

  let tally = 0;
  for (let i = 0; i < QUESTION_COUNT; i++) if ((n >> i) & 1) tally++;

  const verdict = VERDICTS[tally];
  if (!verdict) return new Response(html, { headers: base.headers });

  const title = `trad or prog? verdict: ${verdict.headline}`;
  const desc = truncate(`${tally}/6 answers went prog. ${verdict.blurb}`, 300);
  const ogUrl = `https://tradorprog.bisks.net/v/${encodeURIComponent(id)}`;

  html = html
    .split(GENERIC_TITLE).join(esc(title))
    .split(GENERIC_DESC).join(esc(desc))
    .split(GENERIC_OG_URL).join(ogUrl);

  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=3600" },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // /v/<answerMask> — a real, distinct URL per verdict, so every share
    // gets its own unfurl card instead of one generic page.
    const m = url.pathname.match(/^\/v\/([^/]+)\/?$/);
    if (m) return renderShare(env, request, decodeURIComponent(m[1]));

    return env.ASSETS.fetch(request);
  },
};
