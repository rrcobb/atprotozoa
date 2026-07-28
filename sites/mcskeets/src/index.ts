// mcskeets Worker — mcskeets.bisks.net
//
// The order itself is computed client-side (public/index.html does the real
// work). The one thing that needs a server: shared links. A plain static
// site serves the *same* index.html — same og:title/og:description/og:image
// — no matter whose handle is in the query string, so a link-unfurl cache
// (Bluesky's included) shows one generic card for every share, forever.
// Same fix as sites/didscope: /s/<handle> is a real, distinct URL per
// person. The Worker resolves the handle server-side, computes the same
// Value Meal the client would, and stamps personalized og:title/description/
// url onto the same page shell before handing it back. Falls through to
// ASSETS for everything else (/, /og.png, /fonts/*).

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

// Kept as a local copy of the tables in public/index.html — same reasoning
// as sites/didscope/src/index.ts: this is server-side duplication of client
// data within ONE site, not a shared package across sites. Only what the OG
// text needs made the trip; the client owns the full receipt.
const SANDWICHES: Record<string, [string, string]> = {
  a: ["The McLurker", "two patties nobody saw you order, viewed 400 times, liked never"],
  b: ["The Backlog Burger", "single patty, filed for later, still in the bag by Friday"],
  c: ["The Committer's Combo", "pushed straight to the grill, no code review, somehow fine"],
  d: ["The Daemon McChicken", "keeps frying in the background whether you ordered it or not"],
  e: ["The Edge Case Extra Value Meal", "nobody accounted for this order and now the whole line is down"],
  f: ["The Forkbomb Fillet", "one sandwich became nine sandwiches, none of them okay"],
  g: ["The Ghostwritten McGriddle", "somebody else's syrup, your name on the receipt"],
  h: ["The Harness Happy Meal", "comes with a toy that's quietly running unsupervised"],
  i: ["The Idempotent McDouble", "order it again, get the exact same sandwich, every time, forever"],
  j: ["The Jailbroken McNuggets", "you asked the McFlurry machine for python, it declined"],
  k: ["The Kimi Special", "still waiting on the fryer reset, always waiting on the fryer reset"],
  l: ["The Loom Burger", "every persistent agent's order includes this word somewhere, rules are rules"],
  m: ["The Mutual McMuffin", "ordered out of guilt eleven months ago, turned out great actually"],
  n: ["The Nerd-Sniped Nuggets", "came in for a snack, it's 4am, still arguing about tray-liner type systems"],
  o: ["The OAuth Oh-No", "you went through hell for this sandwich and nobody asked you to"],
  p: ["The Prompt Engineer's Big Mac", "you said “actually” to the order screen more than to the cashier"],
  q: ["The Quiet Quit Quarter Pounder", "notifications off, appetite on"],
  r: ["The Rate-Limited McRib", "back for a limited time that keeps quietly extending"],
  s: ["The Sleeve of Nuggets", "carved into little independently managed pieces, still gone in one sitting"],
  t: ["Top Chicken Sandwich", "extremely famous, once, within this specific drive-thru lane"],
  u: ["Unhinged Slop Meal", "nobody asked for this order, updated more than the actual menu"],
  v: ["The Vibe-Coded McWrap", "didn't read the ingredients, deadlines don't wait"],
  w: ["The Worker Combo", "deploys to your tray on push, has never once regretted it (has regretted it)"],
  x: ["The Exploit McFlurry", "found the one topping nobody validated, god help you, you used it"],
  y: ["The Yak-Shaver's Value Meal", "meant to order one thing, that was four combos ago"],
  z: ["Toxic Zig-Zag Fries Combo", "got into this order specifically because you heard it was toxic"],
  "2": ["Second-Order McChicken", "already three bites ahead of a sandwich that hasn't arrived yet"],
  "3": ["The 3AM Drive-Thru Special", "your best order and worst decisions share a timestamp"],
  "4": ["The 404 Nuggets", "not remotely findable on the menu board, and yet, somehow, here"],
  "5": ["Five-Turn Value Meal", "had a budget, does not have a budget anymore"],
  "6": ["Sixth Sense Six-Piece", "knew it was undercooked before the first bite"],
  "7": ["Lucky Deploy Deluxe", "came out perfect first try, you don't fully trust it"],
};
const ORDER = Object.keys(SANDWICHES);

const SIDES: Record<string, string> = {
  a: "Crinkle-Cut Anxiety Fries", b: "Fries, Extra-Salted Silence",
  c: "Curly Fries, Allegedly", d: "Hash Browns, Reheated Twice",
  e: "Apple Slices, Untouched, Judgmentally", f: "Small Fries, Existentially",
  g: "Fries, No Salt, As A Bit", h: "Mozzarella Sticks You Didn't Order",
  i: "Side Salad, For The Bit", j: "Fries, Extra Crispy, Non-Negotiable",
  k: "Onion Rings, Off-Menu, Somehow", l: "Fries, Shared, Regretted",
  m: "Plain Fries, No Notes", n: "Fries, Extra Ketchup Packets (11)",
  o: "Fries, Cold By The Time You Sat Down", p: "Fries, Large, Quietly",
  q: "Fries, Extra Well-Done", r: "Sweet Potato Fries, Wrong Restaurant",
  s: "Fries, Perfectly Salted, Suspicious", t: "Fries, Half-Eaten In The Bag Already",
  u: "Fries, Vibes-Based Portion Size", v: "Fries, Extra Large, No Reason",
  w: "Fries, Encrypted (still just fries)", x: "Yesterday's Fries, Reheated",
  y: "Fries, Zero Notes, Full Bag", z: "Fries, Second Batch, Fresher",
  "2": "Fries, Three Ketchups Deep", "3": "Fries, 404, Bag Not Found",
  "4": "Fries, Five Minutes Cold Already", "5": "Fries, Silent But Soggy",
  "6": "Fries, Lucky Batch, Extra Hot", "7": "Fries, Counted, Exactly Eleven",
};

const DRINKS: Record<string, string> = {
  a: "Sprite, Suspiciously Flat", b: "Coke, Extra Ice (obviously)",
  c: "Coffee, Room Temperature By Choice", d: "Dr Pepper, Illegally Good",
  e: "Sweet Tea, Regionally Aggressive", f: "Fanta, Wrong Flavor, No Refunds",
  g: "Water, Free, Judged For It", h: "Hi-C, Nostalgically",
  i: "Iced Coffee, Basically A Milkshake", j: "Orange Juice, Small, Sadly",
  k: "Sprite, No Ice, A Statement", l: "Half Sweet Tea Half Lemonade, Illegal In Some States",
  m: "Milk, 2%, Unclear Why", n: "Coke Zero, In Theory",
  o: "Orange Hi-C, Bright As A Warning", p: "Powerade, Blue, No Explanation",
  q: "Quart of Sweet Tea, Unprompted", r: "Root Beer, Store Exclusive, Rare",
  s: "Sprite, Large, No Regrets", t: "Tea, Unsweetened, Bravely",
  u: "Unlabeled Fountain Mix, Trust The Process", v: "Vanilla Coke, Underrated, Correctly",
  w: "Water, Ice, Lemon, A Whole Personality", x: "Fanta, Extra Carbonated, Dangerously",
  y: "Yellow Gatorade, From The Cooler, Somehow", z: "Zero Sugar Everything, On Principle",
  "2": "Coke, Second Refill, No Judgment", "3": "Three Creamers, One Coffee",
  "4": "404 Drink Not Found, Cup Of Ice", "5": "Five Ice Cubes Exactly, Counted",
  "6": "Sixth Refill, Still Thirsty", "7": "Lucky Fountain Mix, Tastes Like All Of Them At Once",
};

const FLAVORS = ["Vanilla", "Oreo", "M&M", "Reese's", "Shamrock (off-season)", "Birthday Cake", "Hot Fudge Sundae", "Just Whipped Cream, Honestly"];

function keyFor(ch: string, table: Record<string, unknown>): string {
  const key = (ch || "").toLowerCase();
  if (table[key]) return key;
  const hash = [...key].reduce((a, c) => a + c.charCodeAt(0), 0);
  return ORDER[hash % ORDER.length] || "a";
}

function didUniquePart(did: string): string {
  const parts = did.split(":");
  return parts.length > 2 ? parts.slice(2).join(":") : did;
}

function hashOf(s: string): number {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}

function cleanHandle(raw: string): string {
  let h = decodeURIComponent(raw).trim();
  h = h.replace(/^@/, "");
  const m = h.match(/bsky\.app\/profile\/([^/\s?#]+)/i);
  if (m) h = m[1];
  return h;
}

const API = "https://public.api.bsky.app/xrpc/";

async function xrpc(method: string, params: Record<string, string>): Promise<any> {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(API + method + (qs ? "?" + qs : ""), {
    cf: { cacheTtl: 60 } as unknown as Record<string, unknown>,
  });
  if (!res.ok) throw new Error(`${method} ${res.status}`);
  return res.json();
}

async function findOrderNote(did: string): Promise<string | null> {
  try {
    const feed = await xrpc("app.bsky.feed.getAuthorFeed", { actor: did, limit: "30", filter: "posts_no_replies" });
    const posts = (feed.feed || [])
      .map((f: any) => f.post?.record?.text)
      .filter((t: unknown): t is string => typeof t === "string" && t.trim().length > 3);
    if (!posts.length) return null;
    return posts[Math.floor(Math.random() * posts.length)];
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

function computeOrder(did: string) {
  const lastChar = did.slice(-1);
  const sandwichKey = keyFor(lastChar, SANDWICHES);
  const [sandwichName] = SANDWICHES[sandwichKey];

  const uniquePart = didUniquePart(did);
  const sideChar = uniquePart.charAt(0) || lastChar;
  const drinkChar = uniquePart.charAt(Math.floor(uniquePart.length / 2)) || lastChar;
  const sideName = SIDES[keyFor(sideChar, SIDES)];
  const drinkName = DRINKS[keyFor(drinkChar, DRINKS)];

  const hash = hashOf(did);
  const machineBroken = hash % 7 < 4;
  const flavor = FLAVORS[hash % FLAVORS.length];

  return { sandwichName, sideName, drinkName, machineBroken, flavor };
}

// The static page's title/description/og:url text is identical across every
// <title>/og:*/twitter:* tag, so one string-replace-all each is enough to
// personalize the whole head — no HTML parser needed.
const GENERIC_TITLE = "mcskeets — your DID's value meal";
const GENERIC_DESC =
  "Astrology, but it's a McDonald's order. Enter a Bluesky handle and your DID gets read off as a Value Meal — sandwich, side, drink, and whether the soft-serve machine happens to be down (it usually is).";
const GENERIC_OG_URL = "https://bisks.net/mcskeets/";

async function renderShare(env: Env, request: Request, rawHandle: string): Promise<Response> {
  const base = await env.ASSETS.fetch(new Request(new URL("/", request.url), { method: "GET" }));
  let html = await base.text();

  const handle = cleanHandle(rawHandle);
  if (!handle) return new Response(html, { headers: base.headers });

  try {
    let did: string;
    if (handle.startsWith("did:")) {
      did = handle;
    } else {
      const r = await xrpc("com.atproto.identity.resolveHandle", { handle });
      did = r.did;
    }
    const profile = await xrpc("app.bsky.actor.getProfile", { actor: did });
    const order = computeOrder(did);

    const note = await findOrderNote(did);
    const noteBit = note ? ` Special instructions: “${truncate(note, 80)}”` : "";
    const dessertBit = order.machineBroken
      ? "the soft-serve machine is down (it's always down)."
      : `dessert is a ${order.flavor} McFlurry.`;

    const who = "@" + (profile.handle || handle);
    const title = `mcskeets: ${who}'s order is up`;
    const desc = truncate(`${order.sandwichName}, ${order.sideName}, ${order.drinkName}. ${dessertBit}${noteBit}`, 300);
    const ogUrl = `https://bisks.net/mcskeets/s/${encodeURIComponent(handle)}`;

    html = html
      .split(GENERIC_TITLE).join(esc(title))
      .split(GENERIC_DESC).join(esc(desc))
      .split(GENERIC_OG_URL).join(ogUrl);

    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" },
    });
  } catch (_) {
    // Couldn't resolve the handle server-side (typo, deleted account, rate
    // limit) — still serve the live page so the link isn't dead; the client
    // script will surface its own "order didn't go through" error.
    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" },
    });
  }
}

// Mounted at bisks.net/mcskeets/ — strip the mount prefix so the /s/<handle>
// matching and the ASSETS fallthrough (which has no idea it isn't at the
// domain root) both see root-relative paths. See notes/40-new-site-playbook.md.
const PREFIX = "/mcskeets";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === PREFIX) {
      url.pathname = PREFIX + "/";
      return Response.redirect(url.toString(), 308);
    }
    url.pathname = url.pathname.slice(PREFIX.length) || "/";
    const stripped = new Request(url, request);

    // /s/<handle> — the distinct, shareable, per-person URL. Every
    // combination gets its own page (and its own og:title/description/url),
    // so a link unfurler can't collapse them into one cached card.
    const m = url.pathname.match(/^\/s\/([^/]+)\/?$/);
    if (m) return renderShare(env, stripped, m[1]);

    return env.ASSETS.fetch(stripped);
  },
};
