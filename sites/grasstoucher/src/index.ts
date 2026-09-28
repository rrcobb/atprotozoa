// grasstoucher Worker — grasstoucher.bisks.net
//
// The intervening all runs client-side (public/index.html). The one thing
// that needed a server: shared interventions. A plain static site serves the
// same index.html — same og:title/description — no matter which intervention
// you got, so a link-unfurl cache shows one generic card for every share,
// forever (same problem/fix as crushcookie's /c/<id> — see its src/index.ts).
//
// Fix: /i/<lectureIndex>-<seed> is a real, distinct URL per intervention. The
// Worker looks up the same lecture text + grass rating + prescription the
// client would compute from that id, and stamps them into the page's
// og:title/description/url before handing it back. Falls through to ASSETS
// for everything else.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

// Kept as a local copy of the table in public/index.html — same reasoning as
// sites/crushcookie/src/index.ts: server-side duplication within ONE site,
// not a shared package across sites. The id encodes an index into this exact
// list, so the two copies must stay in sync if either is edited.
const LECTURES: string[] = [
  "You have been arguing about this for four hours. The tree has been standing here the entire time, saying nothing, and winning.",
  "Nobody in that thread is going to change their mind. Not because they're stubborn — because minds don't change through a screen. Go find one that does.",
  "I read your reply. I read the reply to your reply. I have decided, on your behalf, that this ends now.",
  "In my day we had disagreements too. We just had the decency to have them over a fence, with a neighbor, about a fence.",
  "The discourse will still be there tomorrow, unresolved, exactly as pointless. Grass, on the other hand, is available right now.",
  "You've quote-posted three times today. That is not a debate. That is a cry for help wearing a debate costume.",
  "Nobody has ever won an argument on this website. You will not be the first. Save yourself the trip.",
  "You have spent your morning debating a machine's feelings with strangers who also don't have feelings about you specifically. Reconsider your morning.",
  "The frontier model will still be frontier in an hour. Your knees, however, are only getting older sitting like that.",
  "I've watched the industry replace 'I don't know' with 'the model doesn't know' for thirty-five years. Step outside. The air still doesn't know either, and it's fine.",
  "Whatever it just generated for you will be obsolete by the time you finish reading this sentence. The tree outside has looked the same for forty years and it's doing great.",
  "You do not need to have a hot take about latency. You need water, and possibly a nap.",
  "Nothing you build today will feel real in a year. A tree, notably, will still be a tree. Consider the tree.",
  "That's the ninth minute of continuous scrolling with no destination. You are not going anywhere. That is, in fact, the entire design.",
  "Your thumb has done more cardio today than the rest of you combined. This is not the kind of cardio anyone meant.",
  "The feed does not end. I want you to sit with that for a second, and then I want you to put the phone down anyway.",
  "You have refreshed a page that had nothing new on it four times in the last minute. The page knows. We all know.",
  "Somewhere out there is a sky. It has been out there the entire time you've been looking at this instead.",
  "I've been doing this since before you were born and I can tell you: the scroll has no bottom. Get out while you still remember what grass feels like.",
  "You do not know this person. You will never meet this person. And yet here you both are, at war, over a screenshot.",
  "This stranger cannot see you typing furiously in the dark at 11pm. Only I can see that, and frankly, I'm concerned.",
  "In thirty-five years in this industry I have never once seen a reply guy win. Not once. Not you either, probably.",
  "You have typed 'per my last post' to a total stranger. That is not a rebuttal. That is a distress flare.",
  "Someone you will never meet is wrong on the internet. This has always been true, and it will be true again tomorrow whether or not you personally handle it.",
  "You have checked the number nine times in the last hour. The number has changed twice, by one, in the wrong direction. Step away from the number.",
  "The graph will look the same whether or not you stare at it. It is not, in fact, a fireplace. Stop staring at it like one.",
  "Back in my day the analytics dashboard was a man named Gary who checked once a week. Gary lived to be ninety-one. Consider Gary.",
  "Nobody has ever felt better after the tenth refresh. You will not be the exception the numbers owe you.",
  "The dashboard does not love you back. I say this with the full authority of someone who has watched a great many dashboards not love a great many people back.",
];

// Whimsical add-on, the fortune-cookie-slip equivalent of "learn Chinese" —
// seeded separately from the lecture text so the same lecture can pair with
// different prescriptions on different taps.
const PRESCRIPTIONS: string[] = [
  "go stand near the nearest tree for one (1) full minute",
  "put the phone in a drawer, not just face-down on the table",
  "look at something more than twenty feet away for twenty seconds",
  "drink a full glass of water, like an adult with a body",
  "step outside and identify one (1) bird, correctly or not",
  "sit in a chair that is not the chair you have been sitting in",
  "touch a doorknob, a railing, and one (1) plant, in that order",
  "walk to the end of the block and back, no phone",
  "open a window. smell the air. report back to no one",
  "stretch your neck in a direction it has not gone in six hours",
  "say something out loud to a person in the same room as you",
  "eat something that required more than one hand to prepare",
  "stand up. just that. stand all the way up",
  "look directly at a cloud until you lose interest in the discourse",
  "put both feet flat on actual ground, ideally outdoor ground",
  "text a friend something that isn't a screenshot",
  "sit under literally any tree for the length of one song",
  "blink deliberately, ten times, on purpose, like you mean it",
  "go find grass. touch it. this is the whole website",
  "close the laptop lid. listen to it click. that's the sound of winning",
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

function leavesFor(seed: number): string {
  const rng = mulberry32(seed);
  const r = rng();
  const n = r < 0.45 ? 0 : r < 0.75 ? 1 : r < 0.92 ? 2 : r < 0.99 ? 3 : 4;
  return "🌿".repeat(n) + "🥀".repeat(5 - n);
}

function actFor(seed: number): string {
  const rng = mulberry32(seed + 99991);
  return PRESCRIPTIONS[Math.floor(rng() * PRESCRIPTIONS.length)];
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

const GENERIC_TITLE = "grasstoucher — an unsolicited wellness intervention";
const GENERIC_DESC =
  "Tap the tree for an unsolicited, condescending intervention: log off, touch grass, reconnect with your senses. A grass-touched rating, a prescription, and a card to share.";
const GENERIC_OG_URL = "https://grasstoucher.bisks.net/";

async function renderShare(env: Env, request: Request, id: string): Promise<Response> {
  const base = await env.ASSETS.fetch(new Request(new URL("/", request.url), { method: "GET" }));
  let html = await base.text();

  const m = id.match(/^(\d+)-(\d+)$/);
  if (!m) return new Response(html, { headers: base.headers });

  const index = parseInt(m[1], 10);
  const seed = parseInt(m[2], 10);
  const lecture = LECTURES[index];
  if (!lecture || !Number.isFinite(seed)) {
    return new Response(html, { headers: base.headers });
  }

  const leaves = leavesFor(seed);
  const act = actFor(seed);

  const title = `grasstoucher: “${truncate(lecture, 70)}”`;
  const desc = truncate(`${lecture} Grass touched lately: ${leaves}. Prescribed: ${act}.`, 300);
  const ogUrl = `https://grasstoucher.bisks.net/i/${encodeURIComponent(id)}`;

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

    // /i/<lectureIndex>-<seed> — a real, distinct URL per intervention, so
    // every share gets its own unfurl card instead of one generic page.
    const m = url.pathname.match(/^\/i\/([^/]+)\/?$/);
    if (m) return renderShare(env, request, decodeURIComponent(m[1]));

    return env.ASSETS.fetch(request);
  },
};
