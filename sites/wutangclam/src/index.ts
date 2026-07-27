// wutangclam Worker — mounted at bisks.net/wutangclam/ (see
// notes/40-new-site-playbook.md).
//
// The Wu-Clam Name Generator runs entirely client-side (public/index.html).
// The one thing that needed a server: shared links. A plain static site
// serves the *same* index.html — same og:title/og:description — no matter
// whose handle is in the query string, so every "share your chamber" link
// unfurls as one identical generic card forever (the problem sites/didscope
// and sites/windmill both hit — see notes/45-sharing-and-virality.md).
//
// Fix: /wutangclam/s/<handle> is a distinct URL per person. The Worker
// resolves the handle server-side, computes the same Wu-Clam name the
// client does, and stamps a personalized og:title/og:description/og:url
// onto the same static shell before serving it.
//
// Every request first gets its "/wutangclam" mount prefix stripped; what's
// left is matched against /s/<handle> and otherwise falls through to ASSETS
// for everything else (/, /og.png, /lib/*). ASSETS.fetch always sees the
// un-prefixed path — the assets directory has no idea it isn't living at
// the domain root.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

const PREFIX = "/wutangclam";

// Server-side copy of the tables in public/index.html — same reasoning as
// sites/didscope/src/index.ts: duplication within ONE site, not a shared
// package across sites. Only what the OG text needs (title/noun/prophecy +
// guardians) made the trip; the client owns the full chamber bios.
const TITLE: Record<string, string> = {
  a: "Shaolin", b: "Ol' Dirty", c: "Wu-Tang", d: "Iron", e: "Golden",
  f: "Ghost", g: "Killa", h: "Enter the", i: "Ason", j: "Jade",
  k: "Kung-Fu", l: "Liquid", m: "Method", n: "Ninja", o: "Old School",
  p: "Protect-Ya-Neck", q: "Quick-Draw", r: "Raw", s: "Shadowboxin'",
  t: "Triumphant", u: "Untouchable", v: "Venomous", w: "Wu-Block",
  x: "X-Ray", y: "Yin-Yang", z: "Zodiac",
  "2": "Da Mystery", "3": "36th Chamber", "4": "4th Disciple",
  "5": "5-Finger", "6": "6 Directions", "7": "7th Sword",
};
const NOUN: Record<string, string> = {
  a: "Abalone", b: "Bivalve", c: "Cockle", d: "Dredge", e: "Estuary",
  f: "Filter-Feeder", g: "Geoduck", h: "Half-Shell", i: "Inlet",
  j: "Jetty", k: "Kelp", l: "Littleneck", m: "Mollusk", n: "Nor'easter",
  o: "Oyster", p: "Pearl", q: "Quahog", r: "Razor Clam", s: "Steamer",
  t: "Tidepool", u: "Undertow", v: "Vongole", w: "Whelk", x: "X-Tide",
  y: "Yellowfin", z: "Zooplankton",
  "2": "Second Helping", "3": "Triple Dredge", "4": "Four-Alarm Chowder",
  "5": "Fifth Fathom", "6": "Six-Pack o' Clams", "7": "Seventh Wave",
};
const PROPHECY: Record<string, string> = {
  a: "You move first and ask permission never — first off the boat, first in the pot.",
  b: "Wildest shell in the bucket. Nobody scripts you, not even the tide.",
  c: "The whole crew runs through you — clams rule everything around you.",
  d: "You're chrome-plated and briny. You do not rust, you patina.",
  e: "You shine when the beat drops out. Low tide is your spotlight.",
  f: "You see the whole tidepool before anyone else wets a boot.",
  g: "You collect W's the way a rake collects quahogs.",
  h: "You hit once. That's usually enough — one steam, done.",
  i: "You've been counted out before. Still closed tight. Still alive.",
  j: "Cut like jade, sharp like a shell edge — pretty, and it'll still cut you.",
  k: "Every move's a form. Every form's a shucking knife.",
  l: "You flow like brine — can't be held, only followed downstream.",
  m: "You'll talk it, then you'll walk it, then you'll steam it, in that order.",
  n: "Silent till the pot needs you. Then it's over.",
  o: "You were doing this before the shack had a name.",
  p: "Protect ya neck first. Protect ya shell second. Everything else, negotiable.",
  q: "First one to the dredge, every single time.",
  r: "Uncut, unrinsed, undeniable.",
  s: "Nobody's ever landed a hit while you were still talking.",
  t: "You came back from something. You don't talk about the low tide that did it.",
  u: "You don't answer to the tide chart. The tide chart answers to you.",
  v: "Smile first, apologize never, shell always half-open.",
  w: "Whatever's blocking the block gets re-blocked, then steamed.",
  x: "The unknown catch everybody underestimated.",
  y: "Balance ain't peace. Balance is knowing exactly when the tide turns.",
  z: "Every sign points at you. You still act surprised, like a clam at low tide.",
  "2": "There's a mystery to your chessboxin', and nobody's cracked the shell yet.",
  "3": "Thirty-six chambers deep, and you're still finding chowder in there.",
  "4": "Fourth in line, first to volunteer for the steamer.",
  "5": "Five elements, one style — you switch stances mid-slurp.",
  "6": "Six directions boxin'. You hit angles nobody else sees, even underwater.",
  "7": "Sharpest thing in the bucket, and it isn't close.",
};
const ORDER = Object.keys(TITLE);
const GUARDIANS: string[] = [
  "RZA", "GZA", "Ol' Dirty Bastard", "Raekwon", "Ghostface Killah",
  "Inspectah Deck", "U-God", "Masta Killa", "Method Man",
];

function sumHash(s: string): number {
  let t = 0;
  for (let i = 0; i < s.length; i++) t += s.charCodeAt(i);
  return t;
}

function keyFor(ch: string, table: Record<string, unknown>): string {
  const key = (ch || "").toLowerCase();
  if (table[key]) return key;
  return ORDER[sumHash(key) % ORDER.length] || "a";
}

// everything after "did:<method>:" — same split the client uses to read the
// noun off a different position than the title's trailing char.
function didUniquePart(did: string): string {
  const parts = did.split(":");
  return parts.length > 2 ? parts.slice(2).join(":") : did;
}

function toRoman(n: number): string {
  const vals: [number, string][] = [[10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];
  let out = "";
  for (const [v, sym] of vals) while (n >= v) { out += sym; n -= v; }
  return out;
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

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// The static page's title/description phrase and og:url are identical across
// every <title>/og:*/twitter:* tag, so one split/join each personalizes the
// whole head — no HTML parser needed.
const GENERIC_TITLE = "Wu-Tang Clam — the unofficial, unaffiliated, extremely 1997 fan shack";
const GENERIC_DESC =
  "You were probably looking for Wu-Tang CLAN. This is Wu-Tang CLAM. Nine chambers of shellfish-adjacent tribute, a Wu-Clam Name Generator that reads your atproto DID like a kung-fu scroll, a guestbook, and a hit counter climbing since 1997.";
const GENERIC_OG_URL = "https://bisks.net/wutangclam/";

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

    const lastChar = did.slice(-1);
    const titleKey = keyFor(lastChar, TITLE);
    const uniquePart = didUniquePart(did);
    const nounChar = uniquePart.charAt(0) || lastChar;
    const nounKey = keyFor(nounChar, NOUN);
    const chamber = (sumHash(did) % 36) + 1;
    const guardianIdx = sumHash([...uniquePart].reverse().join("")) % GUARDIANS.length;

    const name = `${TITLE[titleKey]} ${NOUN[nounKey]}`;
    const prophecy = PROPHECY[titleKey];
    const guardian = GUARDIANS[guardianIdx];

    const who = "@" + (profile.handle || handle);
    const title = `Wu-Tang Clam: ${who} is CHAMBER ${toRoman(chamber)} — ${name}`;
    const desc = `${prophecy} Chamber guardian: ${guardian}. Find your own Wu-Clam name at bisks.net/wutangclam.`;
    const ogUrl = `https://bisks.net/wutangclam/s/${encodeURIComponent(handle)}`;

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
    // script will surface its own "couldn't resolve that" error.
    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" },
    });
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname.slice(PREFIX.length) || "/";

    // /s/<handle> — the distinct, shareable, per-person URL. Every
    // combination gets its own page (own og:title/description/url), so a
    // link unfurler can't collapse them into one cached card.
    const m = path.match(/^\/s\/([^/]+)\/?$/);
    if (m) return renderShare(env, request, m[1]);

    const assetUrl = new URL(request.url);
    assetUrl.pathname = path;
    return env.ASSETS.fetch(new Request(assetUrl, request));
  },
};
