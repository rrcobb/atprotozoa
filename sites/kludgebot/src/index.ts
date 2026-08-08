// kludgebot Worker — kludgebot.bisks.net
//
// The whole build-and-upgrade loop is client-side (public/index.html owns
// all the robot state, the upgrade table, and the SVG rendering). The one
// thing that needed a server: /b/<code> gives each shared robot its own
// distinct URL with its own og:title/og:description, so a link-unfurl cache
// doesn't collapse every shared kludgebot into one generic card. Same shape
// as sites/didscope's /s/<handle> route.
//
// The code is a base64url JSON blob the client also uses to replay a shared
// robot in the browser (see decodeShare() in public/index.html) — the
// Worker only needs enough of it (name + upgrade count) to write real OG
// text, so there's no upgrade-table duplication to keep in sync here.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

function fromBase64Url(code: string): string {
  const b64 = code.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  const bin = atob(padded);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function esc(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
}

// Shared verbatim across <title>, meta description, og:*, twitter:* in
// public/index.html — one string-replace-all each swaps the whole head.
// Matched as full quoted attributes for og:url, not the bare origin string:
// the bare origin is also a prefix of the og:image URL ("…/og.png"), and a
// naive split/join on it would corrupt that into "…/b/<code>og.png" too
// (the exact bug caught in sites/skeetin and sites/nothoney — see
// sites/sidenote for both writeups).
const GENERIC_TITLE = "kludgebot — a robot that upgrades itself (badly)";
const GENERIC_DESC =
  "a robot that tries to improve itself, one chaotic self-upgrade at a time. build yours, then watch what it becomes.";
const GENERIC_OG_URL_ATTR = 'content="https://kludgebot.bisks.net/"';

async function renderShare(env: Env, request: Request, rawCode: string): Promise<Response> {
  const base = await env.ASSETS.fetch(new Request(new URL("/", request.url), { method: "GET" }));
  let html = await base.text();

  try {
    const json = JSON.parse(fromBase64Url(decodeURIComponent(rawCode)));
    const name = typeof json.n === "string" ? json.n.slice(0, 24) : "";
    const count = Array.isArray(json.u) ? json.u.length : 0;
    if (!name) return new Response(html, { headers: base.headers });

    const title = `kludgebot: ${name}`;
    const desc =
      count > 0
        ? `${name} has survived ${count} random self-upgrade${count === 1 ? "" : "s"} and is now a genuine crime against engineering. tap to see what it became.`
        : `${name} hasn't attempted a self-upgrade yet. tap to watch it try.`;
    const ogUrl = `https://kludgebot.bisks.net/b/${encodeURIComponent(rawCode)}`;

    html = html
      .split(GENERIC_TITLE).join(esc(title))
      .split(GENERIC_DESC).join(esc(desc))
      .split(GENERIC_OG_URL_ATTR).join(`content="${ogUrl}"`);

    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" },
    });
  } catch (_) {
    // Malformed/truncated code — still serve the live page so the link isn't
    // dead; the client's own decodeShare() will fail the same way and fall
    // back to the normal builder.
    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" },
    });
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    const m = url.pathname.match(/^\/b\/([^/]+)\/?$/);
    if (m) return renderShare(env, request, m[1]);

    return env.ASSETS.fetch(request);
  },
};
