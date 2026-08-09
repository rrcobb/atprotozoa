// hairloom Worker — hairloom.bisks.net
//
// The whole diagnosis still runs client-side (public/index.html does the
// real work). The one thing that needed a server: shared links. A plain
// static site serves the *same* index.html — same og:title/og:description/
// og:image — no matter whose handle is in the query string, so Bluesky's
// link-unfurl cache would show one generic card for every share, forever.
// Same problem, same fix as sites/didscope: /s/<handle> is a real, distinct
// URL per person. The Worker resolves the handle server-side, computes the
// same cure the client does, and stamps personalized
// og:title/og:description/og:url onto the same page shell before handing it
// back — so every share gets its own cache entry and its own preview text.
// Falls through to ASSETS for everything else (/, /og.png, /fonts/*).

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

// Kept as a local copy of the table in public/index.html — server-side
// duplication of client data within ONE site, not a shared package across
// sites. Only what the OG text needs (the cure name + blurb) made the trip;
// the client owns the full ritual/side-effect/potency tables.
const CURES: Record<string, [string, string]> = {
  a: ["The Onion Poultice", "Raw onion, crushed nightly onto the scalp. Neighbors will smell it. Follicles remain skeptical."],
  b: ["The Bull Semen Tonic", "Victorian-era, still sold today, allegedly. Regrowth rate: statistically identical to placebo, spiritually higher."],
  c: ["The Copper Comb Ritual", "Static electricity as folk medicine. Your hair stands up straight. That's it. That's the treatment."],
  d: ["The Dandy Horse Liniment", "A 19th-century patent medicine, reformulated with 2% actual horse."],
  e: ["The Electrostim Cap", "A helmet that mildly shocks your scalp on a schedule you set and then dread."],
  f: ["The Fermented Rice Water Rinse", "K-beauty by way of your grandmother's kitchen counter, left out three days too long."],
  g: ["The Garlic Clove Scalp Massage", "Vampires avoid you now. Follicles remain unconvinced. Your dates have opinions."],
  h: ["The Horsetail Extract Capsules", "Silica, allegedly, from a plant named after the exact thing you're trying to grow back."],
  i: ["The Ice Bath Scalp Plunge", "Cold shock therapy for a scalp that did nothing to deserve this."],
  j: ["The Jojoba & Regret Serum", "A very good oil, applied with a very bad sense of timing — you started this eleven years too late."],
  k: ["The Ketogenic Follicle Protocol", "Eat only meat, cheese, and hope. The hair does not care about your macros."],
  l: ["The Laser Comb", "FDA-cleared, mechanism unclear, results filed under 'ask again in six months.'"],
  m: ["The Minoxidil Micro-Dose", "The one that's actually real, taken at a homeopathic quarter-dose so it doesn't have to work."],
  n: ["The Nettle Tea Rinse", "Stings going on, stings coming off, does nothing measurable in between."],
  o: ["The Onion & Egg Yolk Mask", "Two kitchen ingredients that had never met before you introduced them, directly, to your head."],
  p: ["The Pumpkin Seed Oil Regimen", "DHT-blocking, allegedly, in a study funded by the pumpkin seed oil industry."],
  q: ["The Quicksilver Salve", "A genuinely dangerous 1800s remedy, included here for historical completeness, not application."],
  r: ["The Rosemary Oil Protocol", "The one folk remedy with an actual small study behind it. Suspiciously, this makes it less fun."],
  s: ["The Saw Palmetto Regimen", "A berry, taken as a supplement, in the hope it can out-negotiate your endocrine system."],
  t: ["The Turmeric & Yogurt Mask", "Stains the sink orange forever. The hair, less so."],
  u: ["The Ultrasonic Scalp Massager", "A vibrating device that promises 'increased blood flow' to a place that was never short on it."],
  v: ["The Vinegar Rinse", "Apple cider vinegar, diluted, applied with the confidence of someone who read one forum post."],
  w: ["The Wig, Frankly", "The only 100% success rate in this entire list. Consider it seriously."],
  x: ["The Experimental Compound X-47", "Purchased from a website with no return policy and a five-star review from 'J.'"],
  y: ["The Yogic Inversion Practice", "Hang upside down for twenty minutes a day. Blood rushes to your head. So does regret."],
  z: ["The Zinc & Biotin Megadose", "Nutrients your hair was never actually deficient in, taken at ten times the useful amount."],
  "2": ["The Second Opinion", "You asked a dermatologist. They said 'genetics.' You did not like that answer, so here we are."],
  "3": ["The Three-Step Clinical System", "Cleanse, thicken, activate. Step four, not included, is 'accept.'"],
  "4": ["The Fourth-Generation Family Tonic", "Handed down, unchanged, unimproved, unproven, for four generations."],
  "5": ["The Five-Minute Scalp Detox", "Charcoal, clay, and the specific hope that your hair loss was a hygiene problem all along."],
  "6": ["The Sixth Sense Scalp Reading", "A psychic feels your head and identifies 'blocked energy.' Refunds not offered."],
  "7": ["The Lucky Number Regimen", "No active ingredients. Just seven drops, seven times, for seven days. Faith-based."],
};

// Mirrors public/index.html's LOCKED table — server side only needs the OG
// text fields, not the ritual/side-effect/theme, which stay client-owned.
const LOCKED: Record<string, [string, string]> = {
  "isolyth.dev": [
    "Estrogen (HRT, Prescribed Off-Label)",
    "The one entry on this list backed by actual endocrinology: androgenic hair loss is a DHT problem, and estrogen quietly out-competes DHT everywhere it can reach.",
  ],
};

function potencyFor(did: string): { pct: number; label: string } {
  let hash = 0;
  for (const c of did) hash = (hash * 31 + c.charCodeAt(0)) >>> 0;
  const pct = hash % 141;
  let label: string;
  if (pct <= 15) label = "clinically insignificant";
  else if (pct <= 40) label = "placebo-adjacent";
  else if (pct <= 65) label = "surprisingly persuasive";
  else if (pct <= 90) label = "regulatorily concerning";
  else if (pct <= 100) label = "pending FDA review";
  else label = "batch mislabeled, do not exceed";
  return { pct, label };
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

// The static page's title/description phrase and og:url are identical across
// every <title>/og:*/twitter:* tag, so one string-replace-all each is enough
// to personalize the whole head — no HTML parser needed.
const GENERIC_TITLE = "hairloom — the cure for baldness, passed down through your DID";
const GENERIC_DESC =
  "Enter a Bluesky handle. Your did:plc determines your personalized snake-oil cure, ritual, side effect, and clinically dubious potency rating. Family heirloom, not medical advice.";
// Matched as a full quoted attribute, not the bare URL — the bare URL is
// also a prefix of the og:image/twitter:image URLs ("…/og.png"), so a naive
// split/join on it would corrupt those into "…/s/<handle>og.png" too (the
// exact bug this pattern was written to avoid; see sites/didscope).
const GENERIC_OG_URL_ATTR = 'content="https://hairloom.bisks.net/"';

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
    const key = CURES[lastChar.toLowerCase()] ? lastChar.toLowerCase() : "a";
    const locked = LOCKED[(profile.handle || handle).toLowerCase()] || LOCKED[did.toLowerCase()];
    const [name, blurb] = locked || CURES[key];
    const potency = potencyFor(did);

    const who = "@" + (profile.handle || handle);
    const title = `hairloom: ${who} is prescribed ${name}`;
    const desc = truncate(`${blurb} Potency: ${potency.pct}% (${potency.label}).`, 300);
    const ogUrl = `https://hairloom.bisks.net/s/${encodeURIComponent(handle)}`;

    html = html
      .split(GENERIC_TITLE).join(esc(title))
      .split(GENERIC_DESC).join(esc(desc))
      .split(GENERIC_OG_URL_ATTR).join(`content="${ogUrl}"`);

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

    // /s/<handle> — the distinct, shareable, per-person URL. Every handle
    // gets its own page (and its own og:title/description/url), so a link
    // unfurler can't collapse them into one cached card.
    const m = url.pathname.match(/^\/s\/([^/]+)\/?$/);
    if (m) return renderShare(env, request, m[1]);

    return env.ASSETS.fetch(request);
  },
};
