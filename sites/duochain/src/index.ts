// duochain Worker — duochain.bisks.net
//
// The two accounts' posts are fetched and the blended Markov chain is
// trained and walked entirely client-side (public/lib/atproto.js +
// public/lib/markov.js). The one thing that needs a server: shared results.
// A plain static site serves the *same* index.html — same og:title/
// description — no matter which generated line is in the URL, so every
// "share this line" link would unfurl as one identical generic card forever
// (see notes/45-sharing-and-virality.md). Fix, copied from sites/grue's
// src/index.ts: /q/<code> is a distinct URL per generated line. <code> is a
// URL-safe base64 blob of {t: text, a: handle1, b: handle2} — the client
// encodes it in share() (see public/index.html). The Worker decodes the same
// shape (no chain to replay, the line is already generated) and stamps a
// personalized og:title/description/url onto the same static shell before
// serving it.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

interface SharedPost {
  t: string; // the generated text
  a: string | null; // handle 1
  b: string | null; // handle 2
}

function decodePost(code: string): SharedPost | null {
  try {
    let b64 = code.replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) b64 += "=";
    // atob() decodes to a Latin1 byte-string, not text — the client encoded
    // JSON as UTF-8 bytes before base64 (btoa(unescape(encodeURIComponent(...))))
    // so any non-ASCII byte needs re-decoding as UTF-8, not handed straight
    // to JSON.parse.
    const bin = atob(b64);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const json = new TextDecoder().decode(bytes);
    const o = JSON.parse(json);
    if (typeof o.t !== "string" || !o.t.trim()) return null;
    return {
      t: o.t.slice(0, 320),
      a: typeof o.a === "string" ? o.a.slice(0, 80) : null,
      b: typeof o.b === "string" ? o.b.slice(0, 80) : null,
    };
  } catch (_) {
    return null;
  }
}

function truncate(s: string, max: number): string {
  const g = [...s];
  if (g.length <= max) return s;
  return g.slice(0, max - 1).join("") + "…";
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
const GENERIC_TITLE = "duochain — blend two voices into one post";
const GENERIC_DESC =
  "Trains a Markov chain on two Bluesky accounts' real posts (links and hashtags stripped) and blends them into a brand new post — start or end it with your own sentence if you want.";
const GENERIC_OG_URL_ATTR = 'content="https://duochain.bisks.net/"';

async function renderShare(env: Env, request: Request, code: string): Promise<Response> {
  const base = await env.ASSETS.fetch(new Request(new URL("/", request.url), { method: "GET" }));
  let html = await base.text();

  const post = decodePost(code);
  if (!post) return new Response(html, { headers: base.headers });

  const who = post.a && post.b ? `@${post.a} × @${post.b}` : "two accounts";
  const title = `duochain: “${truncate(post.t, 60)}”`;
  const desc = truncate(`${who}, blended into one Markov chain post: “${post.t}”`, 300);
  const ogUrl = `https://duochain.bisks.net/q/${encodeURIComponent(code)}`;

  html = html
    .split(GENERIC_TITLE).join(esc(title))
    .split(GENERIC_DESC).join(esc(desc))
    .split(GENERIC_OG_URL_ATTR).join(`content="${ogUrl}"`);

  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    const m = url.pathname.match(/^\/q\/([^/]+)\/?$/);
    if (m) return renderShare(env, request, m[1]);

    return env.ASSETS.fetch(request);
  },
};
