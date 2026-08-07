// tamagotchip Worker — tamagotchip.bisks.net
//
// The device simulator and firmware interpreter are entirely client-side
// (public/index.html). The one thing that needs a server: shared firmware
// links. A plain static site serves the *same* index.html — same
// og:title/og:description — no matter what firmware is encoded in the URL,
// so every "share my firmware" link would unfurl as one identical generic
// card forever (same problem sites/didscope and sites/windmill hit, see
// notes/45-sharing-and-virality.md).
//
// Fix: /f/<code> is a distinct URL per firmware. <code> is a URL-safe base64
// blob of {n: name, c: source} — the client builds it in buildShareCode()
// (public/index.html). The Worker decodes the same shape (no need to run the
// interpreter — the name and a short code preview are enough for a card) and
// stamps a personalized og:title/og:description/og:url onto the same static
// shell before serving it.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

interface Payload {
  n: string; // firmware name
  c: string; // firmware source
}

function b64urlDecode(code: string): string {
  let b64 = code.replace(/-/g, "+").replace(/_/g, "/");
  while (b64.length % 4) b64 += "=";
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function decodePayload(code: string): Payload | null {
  try {
    const o = JSON.parse(b64urlDecode(code));
    if (typeof o.c !== "string") return null;
    return { n: typeof o.n === "string" && o.n.trim() ? o.n.trim() : "untitled", c: o.c };
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

// first non-comment, non-blank line of the firmware, as a little preview.
function firstLine(src: string): string {
  const lines = src.split("\n");
  for (const raw of lines) {
    const line = raw.trim();
    if (line && line.charAt(0) !== "#") return line;
  }
  return "";
}

// Every <title>/og:*/twitter:* tag in public/index.html shares these exact
// strings, so one split/join each personalizes the whole head — no HTML
// parser needed (same approach as sites/didscope, sites/windmill).
const GENERIC_TITLE = "tamagotchip — flash your own firmware";
const GENERIC_DESC =
  "A little virtual computer you flash with your own firmware. Write a tiny screen-drawing script, hit flash, watch it boot.";
const GENERIC_OG_URL = "https://tamagotchip.bisks.net/";

async function renderShare(env: Env, request: Request, code: string): Promise<Response> {
  const base = await env.ASSETS.fetch(new Request(new URL("/", request.url), { method: "GET" }));
  const html = await base.text();

  const payload = decodePayload(code);
  if (!payload) return new Response(html, { headers: base.headers });

  const preview = firstLine(payload.c);
  const title = `tamagotchip: “${payload.n}”`;
  const desc = truncate(
    `Someone flashed “${payload.n}” onto their tamagotchip.` + (preview ? ` » ${preview}` : "") +
      " Flash your own at tamagotchip.bisks.net.",
    300,
  );
  const ogUrl = `https://tamagotchip.bisks.net/f/${encodeURIComponent(code)}`;

  const out = html
    .split(GENERIC_TITLE).join(esc(title))
    .split(GENERIC_DESC).join(esc(desc))
    .split(GENERIC_OG_URL).join(ogUrl);

  return new Response(out, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    const m = url.pathname.match(/^\/f\/([^/]+)\/?$/);
    if (m) return renderShare(env, request, m[1]);

    return env.ASSETS.fetch(request);
  },
};
