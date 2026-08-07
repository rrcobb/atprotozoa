// lovecoupons Worker — lovecoupons.bisks.net
//
// Clipping a coupon book and redeeming coupons stays entirely client-side
// (see public/index.html — localStorage owns redemption state). The one
// thing that needed a server: a clipped book's share link is a base64url
// blob of language/index pairs baked into the URL path (/b/<code>), and a
// plain static page serves the *same* og:title/og:description no matter
// what's encoded there — so every book anyone shares would unfurl as one
// generic card forever (same fix as sites/lovejar's /n/<code>).
//
// Fix: decode the book server-side, stamp a personalized og:title/
// og:description/og:url into the same page shell, and let the client script
// do the identical decode to render the coupons interactively.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

// Mirrors public/index.html's LANGS — kept in sync by hand (copy, don't
// abstract). Only needed here to build a preview description; the client
// owns the full interactive rendering.
const LANGS: Record<string, { label: string; icon: string; items: string[] }> = {
  w: {
    label: "Words of Affirmation",
    icon: "💬",
    items: [
      "One (1) heartfelt compliment, redeemable any time you're doubting yourself.",
      'One (1) "I\'m proud of you," no occasion required.',
      "One (1) handwritten note, left somewhere you'll find it by surprise.",
      'One (1) "you make everything better," said out loud, no take-backs.',
      "One (1) three-minute rant about why you're great. I'll start.",
      "One (1) good morning text, sent before you're even awake.",
      'One (1) sincere apology, no "but" attached.',
      "One (1) public brag about you to someone who wasn't even asking.",
    ],
  },
  a: {
    label: "Acts of Service",
    icon: "🧺",
    items: [
      "One (1) load of laundry — washed, dried, folded, and put away. No complaining.",
      "One (1) dinner, cooked, dishes included.",
      "One (1) errand run on your behalf, no questions asked.",
      "One (1) morning where I get up first so you don't have to.",
      "One (1) car cleanout, exterior and that granola in the cupholder.",
      'One (1) "I\'ll deal with the thing you\'ve been dreading" pass.',
      "One (1) surprise-clean living room, redeemable while you nap.",
      "One (1) tech-support session, zero eye-rolling guaranteed.",
    ],
  },
  g: {
    label: "Receiving Gifts",
    icon: "🎁",
    items: [
      "One (1) surprise snack, delivered with zero occasion required.",
      "One (1) small thing that made me think of you, no explanation needed.",
      'One (1) "because I saw it and it\'s so you" purchase, under $10.',
      "One (1) flower, ethically sourced (probably).",
      "One (1) favorite candy, restocked before you notice it's gone.",
      "One (1) playlist, made just for you, with an embarrassing title.",
      "One (1) souvenir from wherever I go without you.",
      'One (1) "I got you a little something," no further context.',
    ],
  },
  t: {
    label: "Quality Time",
    icon: "⏳",
    items: [
      "One (1) phone-free hour, just the two of us, notifications be damned.",
      "One (1) walk, no destination required.",
      "One (1) full movie, my pick this time... okay, your pick.",
      "One (1) cooking-dinner-together session, background music mandatory.",
      "One (1) game night, loser does the dishes.",
      "One (1) long car ride with the good playlist and no agenda.",
      'One (1) "let\'s just sit here and do nothing together" hour.',
      "One (1) stargazing session, blanket and questionable astronomy facts included.",
    ],
  },
  p: {
    label: "Physical Touch",
    icon: "🤗",
    items: [
      "One (1) free hug, minimum ten seconds, extendable on request.",
      "One (1) hand to hold, no reason needed.",
      "One (1) back rub, complaints about my technique accepted.",
      'One (1) "come here," redeemable mid-argument, no questions.',
      "One (1) forehead kiss, deployed without warning.",
      "One (1) cuddle session, blanket fort optional but encouraged.",
      "One (1) piggyback ride, distance negotiable.",
      "One (1) hand-hold during the scary part of the movie.",
    ],
  },
};

interface CouponBook {
  to: string;
  from: string;
  coupons: Array<{ lang: string; text: string }>;
}

function b64urlDecode(str: string): string {
  let b64 = str.replace(/-/g, "+").replace(/_/g, "/");
  while (b64.length % 4) b64 += "=";
  return decodeURIComponent(escape(atob(b64)));
}

function decodeBook(code: string): CouponBook | null {
  try {
    const o = JSON.parse(b64urlDecode(code));
    if (!o || !Array.isArray(o.c) || !o.c.length) return null;
    const coupons: Array<{ lang: string; text: string }> = [];
    for (const pair of o.c) {
      const lang = pair[0];
      const idx = pair[1];
      const pool = LANGS[lang]?.items;
      if (!pool || typeof idx !== "number" || idx < 0 || idx >= pool.length) continue;
      coupons.push({ lang, text: pool[idx] });
    }
    if (!coupons.length) return null;
    return {
      to: typeof o.t === "string" ? o.t.slice(0, 30) : "",
      from: typeof o.f === "string" ? o.f.slice(0, 30) : "",
      coupons,
    };
  } catch (_) {
    return null;
  }
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

// Every <title>/og:*/twitter:* tag on the static shell repeats these two
// phrases verbatim, so one string-replace-all each personalizes the whole
// head — no HTML parser needed, same trick as sites/lovejar.
const GENERIC_TITLE = "love language coupon book — clip a book of quirky coupons";
const GENERIC_DESC =
  "Pick a love language (or five) and clip a shareable coupon book — 'one free hug,' 'one dinner cooked together,' that kind of quirky. Redeem them for real.";
const GENERIC_OG_URL = "https://lovecoupons.bisks.net/";

async function renderBook(env: Env, request: Request, code: string): Promise<Response> {
  const base = await env.ASSETS.fetch(new Request(new URL("/", request.url), { method: "GET" }));
  let html = await base.text();

  const book = decodeBook(code);
  if (!book) {
    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" },
    });
  }

  const who = book.to ? `for ${book.to}` : "for you";
  const title = `🎟️ a ${book.coupons.length}-coupon book ${who}`;
  const first = LANGS[book.coupons[0].lang];
  const desc = truncate(`${first.icon} ${book.coupons[0].text} (+${book.coupons.length - 1} more)`, 280);
  const ogUrl = `https://lovecoupons.bisks.net/b/${encodeURIComponent(code)}`;

  html = html
    .split(GENERIC_TITLE).join(esc(title))
    .split(GENERIC_DESC).join(esc(desc))
    .split(GENERIC_OG_URL).join(ogUrl);

  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // /b/<code> — a distinct, shareable URL per clipped book, so a
    // link-unfurl cache can't collapse every share into one generic card.
    const m = url.pathname.match(/^\/b\/([^/]+)\/?$/);
    if (m) return renderBook(env, request, m[1]);

    return env.ASSETS.fetch(request);
  },
};
