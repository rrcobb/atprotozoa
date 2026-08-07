// crushcookie Worker — crushcookie.bisks.net
//
// The cracking and the advice all run client-side (public/index.html). The
// one thing that needed a server: shared cookies. A plain static site serves
// the same index.html — same og:title/description — no matter which cookie
// you cracked, so a link-unfurl cache shows one generic card for every share,
// forever (same problem/fix as fortunejar's /f/<id> — see its src/index.ts).
//
// Fix: /c/<adviceIndex>-<seed> is a real, distinct URL per cracked cookie.
// The Worker looks up the same advice text + cupid rating + move the client
// would compute from that id, and stamps them into the page's
// og:title/description/url before handing it back. Falls through to ASSETS
// for everything else.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

// Kept as a local copy of the table in public/index.html — same reasoning as
// sites/fortunejar/src/index.ts: server-side duplication within ONE site,
// not a shared package across sites. The id encodes an index into this
// exact list, so the two copies must stay in sync if either is edited.
const ADVICE: string[] = [
  "Text them the meme. Cowardice is not a personality trait.",
  "Eye contact for 1.5 extra seconds is legally considered flirting. Try it.",
  "Stop asking your group chat what it means. It means you like them. Go.",
  "They liked your 3-day-old post. This is a Bat-Signal. Answer it.",
  "Your crush is not a horror movie. You are allowed to walk toward them.",
  "The cookie has spoken: shoot your shot before Mercury un-retrogrades.",
  "Compliment something that isn't their face. It'll hit ten times harder.",
  "Stop rereading the text. It said what it said and it said 'yes, dork.'",
  "Ask the scary question. 'What are we' is a sentence, not a curse.",
  "If you've workshopped the caption for their birthday post, it's not casual anymore.",
  "You are two grown adults. Use your words, not vibes and vague Spotify playlists.",
  "'It's complicated' is doing a lot of heavy lifting for you. Retire it.",
  "Define it or leave it. The cookie doesn't do purgatory.",
  "Stop analyzing their typing bubble. Just ask them to dinner like a person.",
  "Say the nice thing you were thinking. They can't read your mind, only your texts.",
  "Plan a dumb little date. Mini golf still works. It has always worked.",
  "The dishes are not a metaphor for your love, but doing them helps anyway.",
  "You've survived worse arguments than this one. Go make up already.",
  "Tell them one specific thing you still find hot about them. Watch their whole day improve.",
  "Laugh at the joke you've heard forty times. It's cheaper than couples therapy.",
  "Cancel the plans, stay in, be annoying and in love. That's the whole point.",
  "Compliment the thing they think you stopped noticing. You didn't. Say so.",
  "Block, mute, or archive — pick your weapon and use it without guilt.",
  "You are not 'too much.' You were simply served to the wrong table.",
  "Delete the drafted apology text. You did nothing wrong. Eat something instead.",
  "This is a temporary chapter, not the whole book. Turn the page, dramatically if needed.",
  "Cry in the shower once, then put on the villain-era playlist and rebuild.",
  "You didn't lose your person. You lost a person who wasn't looking hard enough.",
  "Your future self is fine, thriving even, and doesn't remember this username.",
  "Grief a little, gossip to your friends a lot, then log off and hydrate.",
  "Being single is not a waiting room. Redecorate it. Order the good takeout.",
  "Flirt with the barista badly on purpose. It builds character and free coffee odds.",
  "Your situationship-free era is a plot twist, not a punishment.",
  "Someone out there is single specifically so they can meet you later. Rude of them, honestly.",
  "Go outside. The apps cannot find you if you are, statistically, outside.",
  "Being picky is a personality trait now, not a red flag. Own it.",
  "Close the app. Your future partner is not in your search history.",
  "Screenshotting their story does not count as a date. Ask them on a real one.",
  "Stop analyzing their read receipts like they're a securities filing.",
  "Post less about them, text them more. The group chat cannot fix this for you.",
  "Touch grass, then touch hands with someone you like. In that order.",
  "A wink emoji is a commitment. Only deploy it if you mean it.",
  "'Netflix and chill' has been retired. Take them somewhere with chairs.",
  "Marry them again today, casually, over breakfast, with your eyes.",
  "Rebound haircuts heal faster than rebound relationships. Start there.",
  "You are the plot. Everyone else is a guest star this season.",
  "Ask a follow-up question. It is the most underrated flirting technique alive.",
  "Your situationship is not a group project. Stop drafting the group chat recap.",
  "Slow dance in the kitchen for no reason. The cookie insists.",
  "You are not behind schedule. There is no schedule. There is only snacks.",
  "Someone who wants you will not make you decode their texts like a cipher.",
];

// Whimsical add-on, the fortune-cookie-slip equivalent of "learn Chinese" —
// seeded separately from the advice text so the same message can pair with
// different little instructions on different cracks.
const MOVES: string[] = [
  "send the meme, no context needed",
  "double-text. it's fine. it's cute now",
  "ask them their coffee order and actually remember it",
  "propose a walk with no destination",
  "compliment them where their friends can hear",
  "make the reservation before you overthink it",
  "wear the thing that makes you feel unstoppable",
  "leave the read receipt on and text back anyway",
  "bring snacks. snacks fix 60% of relationship problems",
  "say 'I like you' out loud, no acronyms",
  "plan something that requires zero small talk",
  "let them pick the movie, even if it's bad",
  "write the toast you'd give at their birthday. keep it for later",
  "ask 'can I kiss you' instead of guessing",
  "text 'thinking of you' with no follow-up question",
  "show up five minutes early, on purpose, for once",
  "let the silence be comfortable instead of filling it",
  "give the honest answer instead of the easy one",
  "block them for your own peace, guilt-free",
  "screenshot this and reread it on a worse day",
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

function heartsFor(seed: number): string {
  const rng = mulberry32(seed);
  const r = rng();
  const n = r < 0.08 ? 2 : r < 0.3 ? 3 : r < 0.65 ? 4 : 5;
  return "❤️".repeat(n) + "🤍".repeat(5 - n);
}

function moveFor(seed: number): string {
  const rng = mulberry32(seed + 99991);
  return MOVES[Math.floor(rng() * MOVES.length)];
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

const GENERIC_TITLE = "crushcookie — silly fortune cookies for your love life";
const GENERIC_DESC =
  "Crack open a virtual fortune cookie for silly, feel-good advice on love, crushes, and relationships. Cute animations, a cupid rating, and a card to share.";
const GENERIC_OG_URL = "https://crushcookie.bisks.net/";

async function renderShare(env: Env, request: Request, id: string): Promise<Response> {
  const base = await env.ASSETS.fetch(new Request(new URL("/", request.url), { method: "GET" }));
  let html = await base.text();

  const m = id.match(/^(\d+)-(\d+)$/);
  if (!m) return new Response(html, { headers: base.headers });

  const index = parseInt(m[1], 10);
  const seed = parseInt(m[2], 10);
  const advice = ADVICE[index];
  if (!advice || !Number.isFinite(seed)) {
    return new Response(html, { headers: base.headers });
  }

  const hearts = heartsFor(seed);
  const move = moveFor(seed);

  const title = `crushcookie: “${truncate(advice, 70)}”`;
  const desc = truncate(`${advice} Cupid rating: ${hearts}. Your move: ${move}.`, 300);
  const ogUrl = `https://crushcookie.bisks.net/c/${encodeURIComponent(id)}`;

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

    // /c/<adviceIndex>-<seed> — a real, distinct URL per cracked cookie, so
    // every share gets its own unfurl card instead of one generic page.
    const m = url.pathname.match(/^\/c\/([^/]+)\/?$/);
    if (m) return renderShare(env, request, decodeURIComponent(m[1]));

    return env.ASSETS.fetch(request);
  },
};
