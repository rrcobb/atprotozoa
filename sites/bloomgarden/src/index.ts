// bloomgarden Worker — bloomgarden.bisks.net
//
// The quiz, garden, watering, and crossing all run client-side (public/index.html).
// The one thing that needed a server: shared links. A plain static site serves the
// *same* index.html — same og:title/description — no matter what bloom code is in
// the URL, so every "look at my bloom"/"look at our hybrid" link would unfurl as
// one identical generic card forever (same problem sites/bouquet and sites/didscope
// hit, see notes/45-sharing-and-virality.md).
//
// Fix: /view/<code> is a distinct URL per bloom or hybrid. <code> is a URL-safe
// base64 blob of {n: name, x: [5 trait scores 0-100], t: "g"|"h", p?: {n,s,c}}
// (mirrored in public/index.html's b64urlEncode/decodeBloomCode). The Worker
// decodes just enough to personalize og:title/description — whose bloom it is,
// its dominant trait, and (for a hybrid) who it's a cross of.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

const AXES = ["warmth", "wild", "calm", "spark", "deep"];
const AXIS_LABELS: Record<string, string> = { warmth: "warmth", wild: "wildness", calm: "calm", spark: "spark", deep: "depth" };
const SPECIES_BY_AXIS: Record<string, string> = { warmth: "rose", wild: "poppy", calm: "lily", spark: "daisy", deep: "iris" };
const SPECIES_EMOJI: Record<string, string> = { rose: "🌹", poppy: "🌺", lily: "🪷", daisy: "🌼", iris: "🌸" };

interface BloomCode {
  n: string;
  x: number[];
  t: "g" | "h";
  p?: { n: [string, string] };
}

function decodeCode(code: string): BloomCode | null {
  try {
    let b64 = code.replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) b64 += "=";
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const json = new TextDecoder().decode(bytes);
    const o = JSON.parse(json);
    if (typeof o.n !== "string" || !Array.isArray(o.x) || o.x.length !== 5) return null;
    const x = o.x.map((n: unknown) => Math.max(0, Math.min(100, Math.round(Number(n) || 0))));
    const out: BloomCode = { n: String(o.n).slice(0, 30) || "a bloom", x, t: o.t === "h" ? "h" : "g" };
    if (out.t === "h" && o.p && Array.isArray(o.p.n)) {
      out.p = { n: [String(o.p.n[0] || "someone").slice(0, 30), String(o.p.n[1] || "someone").slice(0, 30)] };
    }
    return out;
  } catch (_) {
    return null;
  }
}

function traitBlurb(x: number[]): string {
  const order = [0, 1, 2, 3, 4].sort((a, b) => x[b] - x[a] || a - b);
  const top = AXES[order[0]], sec = AXES[order[1]];
  return `mostly ${AXIS_LABELS[top]} ${SPECIES_EMOJI[SPECIES_BY_AXIS[top]]}, with a touch of ${AXIS_LABELS[sec]} ${SPECIES_EMOJI[SPECIES_BY_AXIS[sec]]}`;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Every <title>/og:*/twitter:* tag in public/index.html shares these exact
// strings, so one split/join each personalizes the whole head — no HTML
// parser needed.
const GENERIC_TITLE = "bloomgarden — grow a flower that's you, cross it with someone else's";
const GENERIC_DESC =
  "Take a short quiz to grow a flower that represents your personality, water it over real days until it blooms, then cross-pollinate it with a friend's bloom to grow a hybrid with traits from both.";
const GENERIC_OG_URL = "https://bloomgarden.bisks.net/";

async function renderShare(env: Env, request: Request, code: string): Promise<Response> {
  const base = await env.ASSETS.fetch(new Request(new URL("/", request.url), { method: "GET" }));
  const html = await base.text();

  const data = decodeCode(code);
  if (!data) return new Response(html, { headers: base.headers });

  const blurb = traitBlurb(data.x);
  let title: string;
  let desc: string;
  if (data.t === "h") {
    const parents = data.p ? `${data.p.n[0]} × ${data.p.n[1]}` : "two blooms";
    title = `${data.n} 🌸 — a hybrid bloom`;
    desc = `A cross of ${parents}, ${blurb}. See it on bloomgarden.`;
  } else {
    title = `${data.n}'s bloom 🌱`;
    desc = `A flower grown from a personality quiz — ${blurb}. See it and cross it on bloomgarden.`;
  }
  const ogUrl = `https://bloomgarden.bisks.net/view/${encodeURIComponent(code)}`;

  const stamped = html
    .split(GENERIC_TITLE).join(esc(title))
    .split(GENERIC_DESC).join(esc(desc))
    .split(GENERIC_OG_URL).join(ogUrl);

  return new Response(stamped, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    const m = url.pathname.match(/^\/view\/([^/]+)\/?$/);
    if (m) return renderShare(env, request, m[1]);

    return env.ASSETS.fetch(request);
  },
};
