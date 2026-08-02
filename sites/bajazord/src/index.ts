// bajazord Worker — bajazord.bisks.net
//
// The megazord assembly itself is entirely client-side (public/app.js). The
// one thing that needs a server: shared links. A plain static site serves
// the *same* index.html — same og:title/og:description/og:image — no matter
// which seed picked which three parts, so Bluesky's link-unfurl cache would
// show one generic card forever no matter who shares their combo (same wall
// sites/didscope hit — see its src/index.ts).
//
// Fix: /z/<seed> is a real, distinct URL per combo. The Worker reads the
// bundled parts.json off ASSETS, reproduces the exact same seed -> three
// parts pick the client makes (same FNV-1a + mulberry32, ported line for
// line from public/app.js — this is server-side duplication of client logic
// within ONE site, not a shared package across sites), and stamps
// personalized og:title/og:description/og:url onto the page shell before
// handing it back. Falls through to ASSETS for everything else.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

interface Part {
  name: string;
  title: string;
  type: string;
  blurb: string;
  url: string;
}

const ROLE_LABELS = ["cockpit", "core", "thrusters"];

function hash32(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickThree(seedStr: string, pool: Part[]): Part[] {
  const rand = mulberry32(hash32(seedStr));
  const idx = pool.map((_, i) => i);
  const picked: Part[] = [];
  for (let k = 0; k < 3 && idx.length; k++) {
    const i = Math.floor(rand() * idx.length);
    picked.push(pool[idx[i]]);
    idx.splice(i, 1);
  }
  return picked;
}

function cleanSeed(raw: string): string {
  return decodeURIComponent(raw).trim().replace(/^@/, "").toLowerCase();
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

const GENERIC_TITLE = "bajazord — three atprotozoa sites, one Baja Blast megazord";
const GENERIC_DESC =
  "Type a handle. It hashes to three real atprotozoa sites, yanked out of the catalog and slammed together into a teal-magenta-lime megazord. Assemble your own.";
const GENERIC_OG_URL = "https://bajazord.bisks.net/";

async function renderShare(env: Env, request: Request, rawSeed: string): Promise<Response> {
  const base = await env.ASSETS.fetch(new Request(new URL("/", request.url), { method: "GET" }));
  let html = await base.text();

  try {
    // cleanSeed decodeURIComponent()s the raw path segment, which throws on
    // a malformed percent-encoding — keep it inside the try so a garbled
    // /z/<seed> still falls through to the generic page instead of a 500.
    const seed = cleanSeed(rawSeed);
    if (!seed) return new Response(html, { headers: base.headers });

    const partsRes = await env.ASSETS.fetch(new Request(new URL("/data/parts.json", request.url)));
    const pool: Part[] = await partsRes.json();
    const picked = pickThree(seed, pool);
    if (picked.length < 3) return new Response(html, { headers: base.headers });

    const names = picked.map((p) => p.title).join(" + ");
    const title = `bajazord: @${seed}'s Baja Blast Megazord — ${names}`;
    const desc = truncate(
      picked.map((p, i) => `${ROLE_LABELS[i]}: ${p.title}`).join(" · ") + ". Assemble your own.",
      300
    );
    const ogUrl = `https://bajazord.bisks.net/z/${encodeURIComponent(seed)}`;

    html = html
      .split(GENERIC_TITLE).join(esc(title))
      .split(GENERIC_DESC).join(esc(desc))
      .split(GENERIC_OG_URL).join(ogUrl);

    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" },
    });
  } catch (_) {
    // Couldn't load/parse the parts pool server-side — still serve the live
    // page so the link isn't dead; the client script assembles it anyway.
    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" },
    });
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // /z/<seed> — the distinct, shareable, per-combo URL. Every megazord
    // gets its own page (and its own og:title/description/url), so a link
    // unfurler can't collapse them all into one cached card.
    const m = url.pathname.match(/^\/z\/([^/]+)\/?$/);
    if (m) return renderShare(env, request, m[1]);

    return env.ASSETS.fetch(request);
  },
};
