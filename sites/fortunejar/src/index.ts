// fortunejar Worker — fortunejar.bisks.net
//
// The cracking, the jar, and the lucky numbers all run client-side
// (public/index.html). The one thing that needed a server: shared fortunes.
// A plain static site serves the same index.html — same og:title/description
// — no matter which fortune you cracked, so a link-unfurl cache shows one
// generic card for every share, forever (same problem/fix as didscope's
// /s/<handle> — see its src/index.ts).
//
// Fix: /f/<fortuneIndex>-<seed> is a real, distinct URL per cracked fortune.
// The Worker looks up the same fortune text + lucky numbers the client would
// compute from that id, and stamps them into the page's og:title/description/
// url before handing it back. Falls through to ASSETS for everything else.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

// Kept as a local copy of the table in public/index.html — same reasoning as
// sites/didscope/src/index.ts: server-side duplication within ONE site, not a
// shared package across sites. The id encodes an index into this exact list,
// so the two copies must stay in sync if either is edited.
const FORTUNES: string[] = [
  "You are the reason someone's day got better today, even if they never said so.",
  "Someone out there has your messages saved because they matter that much.",
  "The love you give away quietly is still being counted somewhere.",
  "You make ordinary rooms feel less empty just by being in them.",
  "Somebody's favorite memory has you in the background of it.",
  "You are allowed to take up space, and someone is glad you do.",
  "The small kindness you did last week is still helping someone today.",
  "You are somebody's proof that good people exist.",
  "Your presence in someone's life is a gift they don't say out loud enough.",
  "You are loved by people who haven't told you in a while — tell them first.",
  "The version of you that's tired and trying is still worth showing up for.",
  "Somewhere, someone is grateful they get to know you.",
  "You don't have to earn rest. You've already done enough today.",
  "The friend who reads your messages twice before replying really does care.",
  "You are someone's soft place to land.",
  "Your laugh has made someone's whole week better at least once.",
  "You are more remembered, and more missed, than you think.",
  "Somebody kept a screenshot of something kind you said.",
  "The love in your life is bigger than the one bad thing that happened today.",
  "You are allowed to be loved exactly as you are right now, unfinished.",
  "Someone is proud of you and hasn't found the right moment to say it.",
  "You give better advice than you take. Take some of it today.",
  "A message from you, even a short one, would make someone's day.",
  "You are worth the effort it takes to know you well.",
  "The people who matter already forgave the thing you're still sorry about.",
  "You have been someone's favorite part of a bad week before.",
  "Send the text. They'll be glad you did.",
  "You are not a burden — you are a person people choose, again and again.",
  "Somebody out there is hoping you have a good day today, quietly, without saying it.",
  "The love you're looking for is already closer than you think — check your notifications.",
  "You've been kinder to a stranger than you know. It mattered.",
  "You are allowed to like yourself. It's not arrogance, it's accuracy.",
  "Someone kept your number saved under a nickname that makes them smile.",
  "The world is slightly warmer because you're in it today.",
  "You are somebody's calm in a loud week.",
  "A hug is coming your way, whether or not anyone's around to give it.",
  "You've made someone feel safe just by being consistent.",
  "The people who love you don't need a reason. That's what makes it real.",
  "You are exactly the kind of person worth waiting for.",
  "Somebody thinks about the nice thing you did more than you do.",
  "You are loved in ways too quiet to notice and too real to doubt.",
  "Today, let someone take care of you for once.",
  "You are not too much. You are simply not for everyone, and that's fine.",
  "The best thing you did this month, you probably don't remember doing.",
  "You are someone's good news.",
  "Whoever needed to hear this: you're doing better than you think.",
  "You've been forgiven for more than you know, by people who love you anyway.",
  "The right people already think you're enough.",
  "You are somebody's favorite notification.",
  "Go tell someone you love them. This is your sign.",
  "Somebody in your mutuals would drop everything to help you. You know who.",
  "A stranger liked one of your posts and thought \"good for them\" — genuinely.",
  "Someone screenshotted your bio because it made them smile.",
  "Of everything that scrolled by today, someone paused on you.",
  "You are a mutual worth keeping.",
  "Somebody in your notifications is rooting for you, quietly.",
];

// Whimsical add-on, the fortune-cookie-slip equivalent of "learn Chinese" —
// seeded separately from the fortune text so the same message can pair with
// different little instructions on different cracks.
const LUCKY_ACTS: string[] = [
  "send one \"thinking of you\" text before noon",
  "say thank you out loud today, not just in your head",
  "reply to that draft you've been sitting on",
  "tell someone their cooking / playlist / plan was good, specifically",
  "let a compliment land instead of deflecting it",
  "call instead of texting, just this once",
  "forgive yourself for the thing from Tuesday",
  "let someone else pick where you eat",
  "save this fortune and reread it on a worse day",
  "hug the first willing person you see",
  "leave the good review you keep meaning to leave",
  "tell a friend what you like about them, unprompted",
  "take the nap. it counts as productive today",
  "answer honestly when someone asks how you're doing",
  "keep the plans, even the small ones",
  "let yourself be the one who's excited about something",
  "give the benefit of the doubt, just this once",
  "wear the thing that makes you feel good, no occasion needed",
  "check in on the friend who always checks in on you",
  "accept help when it's offered",
];

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function luckyNumbersFor(seed: number): number[] {
  const rng = mulberry32(seed);
  const nums = new Set<number>();
  while (nums.size < 6) nums.add(1 + Math.floor(rng() * 49));
  return [...nums].sort((a, b) => a - b);
}

function luckyActFor(seed: number): string {
  const rng = mulberry32(seed + 99991);
  return LUCKY_ACTS[Math.floor(rng() * LUCKY_ACTS.length)];
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

const GENERIC_TITLE = "fortunejar — crack open today's fortune";
const GENERIC_DESC =
  "A digital fortune cookie jar. Crack one open for a sweet message, lucky numbers, and a tiny thing to do about it — then keep every fortune you've ever cracked.";
const GENERIC_OG_URL = "https://fortunejar.bisks.net/";

async function renderShare(env: Env, request: Request, id: string): Promise<Response> {
  const base = await env.ASSETS.fetch(new Request(new URL("/", request.url), { method: "GET" }));
  let html = await base.text();

  const m = id.match(/^(\d+)-(\d+)$/);
  if (!m) return new Response(html, { headers: base.headers });

  const index = parseInt(m[1], 10);
  const seed = parseInt(m[2], 10);
  const fortune = FORTUNES[index];
  if (!fortune || !Number.isFinite(seed)) {
    return new Response(html, { headers: base.headers });
  }

  const numbers = luckyNumbersFor(seed);
  const act = luckyActFor(seed);

  const title = `fortunejar: “${truncate(fortune, 70)}”`;
  const desc = truncate(
    `${fortune} Lucky numbers: ${numbers.join(", ")}. And: ${act}.`,
    300
  );
  const ogUrl = `https://fortunejar.bisks.net/f/${encodeURIComponent(id)}`;

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

    // /f/<fortuneIndex>-<seed> — a real, distinct URL per cracked fortune, so
    // every share gets its own unfurl card instead of one generic page.
    const m = url.pathname.match(/^\/f\/([^/]+)\/?$/);
    if (m) return renderShare(env, request, decodeURIComponent(m[1]));

    return env.ASSETS.fetch(request);
  },
};
