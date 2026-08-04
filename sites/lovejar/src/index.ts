// lovejar Worker — lovejar.bisks.net
//
// Writing notes and drawing them stays entirely client-side (see
// public/index.html — localStorage owns the jar). The one thing that needed a
// server: a drawn note's share link is a base64url blob of its text baked
// into the URL path (/n/<code>), and a plain static page serves the *same*
// og:title/og:description no matter what's encoded there — so every note
// anyone shares would unfurl as one generic card forever (same fix as
// sites/gratitude-garden's /b/<code> and sites/didscope's /s/<handle>).
//
// Fix: decode the note server-side, stamp it into og:title/og:description/
// og:url on the same page shell, and let the client script do the identical
// decode to render the note interactively.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

interface JarNote {
  who: string;
  name: string;
  m: string;
}

function b64urlDecode(str: string): string {
  let b64 = str.replace(/-/g, "+").replace(/_/g, "/");
  while (b64.length % 4) b64 += "=";
  return decodeURIComponent(escape(atob(b64)));
}

function decodeNote(code: string): JarNote | null {
  try {
    const o = JSON.parse(b64urlDecode(code));
    if (!o || typeof o.m !== "string" || !o.m.trim()) return null;
    return {
      who: o.w === "someone" ? "someone" : "me",
      name: (typeof o.n === "string" ? o.n : "").slice(0, 40),
      m: o.m.slice(0, 240),
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
// head — no HTML parser needed, same trick as gratitude-garden/didscope.
const GENERIC_TITLE = "love jar — write it down, draw it out";
const GENERIC_DESC =
  "Drop little notes of appreciation into a jar — for yourself or for someone else — then draw a random one out whenever you need to hear it.";
const GENERIC_OG_URL = "https://lovejar.bisks.net/";

async function renderNote(env: Env, request: Request, code: string): Promise<Response> {
  const base = await env.ASSETS.fetch(new Request(new URL("/", request.url), { method: "GET" }));
  let html = await base.text();

  const note = decodeNote(code);
  if (!note) {
    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" },
    });
  }

  const who = note.who === "someone" ? (note.name ? `for ${note.name}` : "for someone") : "for you";
  const title = `💌 a note ${who} — love jar`;
  const desc = truncate(note.m, 280);
  const ogUrl = `https://lovejar.bisks.net/n/${encodeURIComponent(code)}`;

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

    // /n/<code> — a distinct, shareable URL per drawn note, so a link-unfurl
    // cache can't collapse every share into one generic card.
    const m = url.pathname.match(/^\/n\/([^/]+)\/?$/);
    if (m) return renderNote(env, request, m[1]);

    return env.ASSETS.fetch(request);
  },
};
