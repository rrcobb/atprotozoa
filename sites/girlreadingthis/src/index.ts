// girlreadingthis Worker — girlreadingthis.bisks.net
//
// Picking and rerolling a line all happen client-side (see public/index.html
// — MESSAGES lives there too). The one thing that needed a server: a line's
// share link is just /m/<id>, and a plain static page serves the *same*
// og:title/og:description no matter which line is showing — so every link
// anyone shares would unfurl as one generic card forever (the same bug
// called out in sites/gratitude-garden's src/index.ts for /b/<code>).
//
// Fix: look up the line server-side, stamp it into
// og:title/og:description/og:url on the same page shell, and let the
// client's identical MESSAGES lookup render it interactively too.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

// Kept as a local copy of the MESSAGES list in public/index.html — server-side
// duplication within ONE site, not a shared package across sites (same
// reasoning as sites/gratitude-garden's FLOWERS table).
const MESSAGES: string[] = [
  "is loved by more people than she realizes.",
  "is going to be okay.",
  "is doing great, actually — better than the group chat in her head says.",
  "deserves a really good cup of something warm today.",
  "is allowed to rest without earning it first.",
  "is more resilient than she gives herself credit for.",
  "is exactly on time. there is no schedule she's behind on.",
  "is going to laugh, for real, at some point today.",
  "should drink some water right now. yes, right now.",
  "is closer to the good part than it feels like.",
  "made the right call, even if it didn't feel like it at the time.",
  "is somebody's favorite person, whether she believes it or not.",
  "gets to have a soft day today. no reason required.",
  "is not too much. she is just enough.",
  "should text the friend she's been thinking about.",
  "is going to figure it out. she always does.",
  "deserves the same kindness she hands out to everyone else.",
  "is allowed to change her mind.",
  "is worth the effort it takes to actually know her.",
  "gets to take up space.",
  "should put the phone down and go outside for ten minutes.",
  "already knows the answer. she's just scared of it.",
  "is somebody's whole reason to smile today.",
  "gets a good night's sleep tonight. no excuses.",
  "is stronger than whatever is making today hard.",
  "should be proud of how far she's come. actually proud, not just saying it.",
  "is going to get good news soon.",
  "is not behind. she's just early for something she can't see yet.",
  "did better today than she's giving herself credit for.",
  "is allowed to ask for help.",
  "is exactly who someone out there is hoping to meet.",
  "should save this and reread it on a worse day.",
  "is not being dramatic. it's actually hard. that's allowed.",
  "is going to look back on this season and be proud she kept going.",
  "is doing the best she can with what she's got right now, and that counts.",
  "deserves to hear this from someone other than herself for once.",
];

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// The static page's title/description/url phrases are identical across every
// <title>/og:*/twitter:* tag, so one string-replace-all each personalizes the
// whole head — no HTML parser needed, same trick as sites/gratitude-garden.
const GENERIC_TITLE = "the girl reading this — a small, sincere thing for whoever needed it";
const GENERIC_DESC = "Finishes the sentence for you, one sincere line at a time: the girl reading this ___";
// Bounded with the closing quote: the bare origin is also a *prefix* of the
// og:image/twitter:image URLs (".../og.png") and the client script's own
// urlFor() string, so an unbounded replace would corrupt those too — caught
// while building this site, not copied from gratitude-garden's version of
// the same trick on purpose.
const GENERIC_OG_URL_ATTR = 'content="https://girlreadingthis.bisks.net/"';

async function renderMessage(env: Env, request: Request, idRaw: string): Promise<Response> {
  const base = await env.ASSETS.fetch(new Request(new URL("/", request.url), { method: "GET" }));
  let html = await base.text();

  const n = parseInt(idRaw, 10);
  if (!Number.isFinite(n) || n < 0) {
    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" },
    });
  }
  const idx = n % MESSAGES.length;
  const line = MESSAGES[idx];

  const title = `the girl reading this ${line}`;
  const desc = "a small, sincere thing for whoever needed to read it today.";
  const ogUrl = `https://girlreadingthis.bisks.net/m/${idx}`;

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

    // /m/<id> — a distinct, shareable URL per line, so a link-unfurl cache
    // can't collapse every share into one generic card.
    const m = url.pathname.match(/^\/m\/(\d+)\/?$/);
    if (m) return renderMessage(env, request, m[1]);

    return env.ASSETS.fetch(request);
  },
};
