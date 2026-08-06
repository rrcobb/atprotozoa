// bouquet Worker — bouquet.bisks.net
//
// The whole builder and the reveal animation run client-side
// (public/index.html). The one thing that needed a server: shared links. A
// plain static site serves the *same* index.html — same og:title/description
// — no matter what bouquet code is in the URL, so every "send this bouquet"
// link unfurls as one identical generic card forever (same problem
// sites/didscope hit, see notes/45-sharing-and-virality.md).
//
// Fix: /s/<code> is a distinct URL per bouquet. <code> is a URL-safe base64
// blob of {s: [[flowerType, colorIdx], ...], w: wrapIdx, r: ribbonIdx,
// m: message, to, fr} — the client encodes it in wrapBtn's click handler
// (public/index.html, b64urlEncode/b64urlDecode). The Worker decodes the
// same shape just far enough to personalize og:title/description (who it's
// for, how many stems) — it never needs the hidden message, and doesn't
// surface it in the OG text, so the "hidden" part stays hidden until someone
// actually opens the link.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

interface BouquetData {
  s: [number, number][];
  to?: string;
  fr?: string;
}

function decodeCode(code: string): BouquetData | null {
  try {
    let b64 = code.replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) b64 += "=";
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const json = new TextDecoder().decode(bytes);
    const o = JSON.parse(json);
    if (!Array.isArray(o.s) || o.s.length === 0) return null;
    return { s: o.s, to: typeof o.to === "string" ? o.to : "", fr: typeof o.fr === "string" ? o.fr : "" };
  } catch (_) {
    return null;
  }
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Every <title>/og:*/twitter:* tag in public/index.html shares these exact
// strings, so one split/join each personalizes the whole head — no HTML
// parser needed.
const GENERIC_TITLE = "bouquet — send someone flowers, with a secret tucked inside";
const GENERIC_DESC =
  "Build a digital bouquet, tuck a hidden message inside, and send the link to a friend or a secret crush. No account needed.";
const GENERIC_OG_URL = "https://bouquet.bisks.net/";

async function renderShare(env: Env, request: Request, code: string): Promise<Response> {
  const base = await env.ASSETS.fetch(new Request(new URL("/", request.url), { method: "GET" }));
  const html = await base.text();

  const data = decodeCode(code);
  if (!data) return new Response(html, { headers: base.headers });

  const n = data.s.length;
  const title = data.to ? `A bouquet for ${data.to} 🌷` : "Someone sent you a bouquet 🌷";
  const descBits = [`A ${n}-stem bouquet, wrapped and ready`];
  if (data.fr) descBits.push(`from ${data.fr}`);
  const desc = `${descBits.join(", ")}. Tap to open — there's a note tucked inside.`;
  const ogUrl = `https://bouquet.bisks.net/s/${encodeURIComponent(code)}`;

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

    const m = url.pathname.match(/^\/s\/([^/]+)\/?$/);
    if (m) return renderShare(env, request, m[1]);

    return env.ASSETS.fetch(request);
  },
};
