// windmill Worker — windmill.bisks.net
//
// The game itself is entirely client-side (public/index.html runs the whole
// sixteen-season sim). The one thing that needed a server: shared results. A
// plain static site serves the *same* index.html — same og:title/description
// — no matter what score is in the URL, so every "share your season" link
// unfurls as one identical generic card forever (same problem sites/didscope
// hit, see notes/45-sharing-and-virality.md).
//
// Fix: /r/<code> is a distinct URL per result. <code> is a URL-safe base64
// blob of {m: 'b'|'c', s: score, c: crashes, w: windmill%} — the client
// encodes it in finishGame() (public/index.html, encodeResult/decodeResult).
// The Worker decodes the same shape (no game logic to replay, the result is
// already computed) and stamps a personalized og:title/description/url onto
// the same static shell before serving it. Falls through to ASSETS for
// everything else (/, /og.png, /fonts/*).

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

interface Result {
  m: string; // 'b' barter | 'c' credit
  s: number; // score
  c: number; // crashes (credit mode only)
  w: number; // windmill % built
}

function decodeResult(code: string): Result | null {
  try {
    let b64 = code.replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) b64 += "=";
    const json = atob(b64);
    const o = JSON.parse(json);
    if (typeof o.s !== "number" || typeof o.w !== "number") return null;
    return { m: o.m === "c" ? "c" : "b", s: o.s, c: o.c || 0, w: o.w };
  } catch (_) {
    return null;
  }
}

function fmt(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Every <title>/og:*/twitter:* tag in public/index.html shares these exact
// strings (kept in sync deliberately), so one split/join each personalizes
// the whole head — no HTML parser needed.
const GENERIC_TITLE = "Windmill — the Animal Farm economy game";
const GENERIC_DESC =
  "Barter mode or Credit mode. Build the windmill, set the interest rate, and find out the hard way what leverage does to a farm.";
const GENERIC_OG_URL = "https://windmill.bisks.net/";

async function renderResult(env: Env, request: Request, code: string): Promise<Response> {
  const base = await env.ASSETS.fetch(new Request(new URL("/", request.url), { method: "GET" }));
  const html = await base.text();

  const result = decodeResult(code);
  if (!result) return new Response(html, { headers: base.headers });

  const modeName = result.m === "c" ? "Credit mode" : "Barter mode";
  const modeEmoji = result.m === "c" ? "🏦" : "🌾";
  const title = `Windmill: ${modeEmoji} ${modeName}, score ${fmt(result.s)}`;
  const descBits = [`Windmill ${Math.floor(result.w)}% built`];
  if (result.m === "c") descBits.push(result.c > 0 ? `survived ${result.c} bank collapse(s)` : "the Bank held steady");
  else descBits.push("no debt, no bust");
  const desc = `${descBits.join(", ")}. Run Manor Farm's economy yourself and see what credit does to a market.`;
  const ogUrl = `https://windmill.bisks.net/r/${encodeURIComponent(code)}`;

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

    const m = url.pathname.match(/^\/r\/([^/]+)\/?$/);
    if (m) return renderResult(env, request, m[1]);

    return env.ASSETS.fetch(request);
  },
};
