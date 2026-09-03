// claimsky Worker — claimsky.bisks.net
//
// The whole induction runs client-side (public/index.html does the real
// work: hash the handle into a seed, walk six escalating "ERIS" message
// stages picked from that seed, then render a claim certificate). Unlike
// sites/posterspsychosis this never calls the AppView — the handle doesn't
// have to resolve to anything real, that's the point. The one thing that
// needed a server: shared links. A plain static site serves the *same*
// index.html — same og:title/og:description/og:image — no matter whose
// handle is in the URL, so a link-unfurl cache would show one generic card
// for every share, forever. Same fix as sites/didscope and
// sites/posterspsychosis: /s/<handle> is a real, distinct URL per person.
// The Worker runs the exact same deterministic hash the client would and
// stamps personalized og:title/og:description/og:url onto the same page
// shell before handing it back — no network call, so it can't fail.
// Falls through to ASSETS for everything else (/, /og.png, /fonts/*).

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

// Kept as a local copy of a table in public/index.html — same reasoning as
// sites/didscope/src/index.ts and sites/posterspsychosis/src/index.ts:
// server-side duplication within ONE site, not a shared package across
// sites. Only what the OG text needs (the final claim line) made the trip.
const CLAIM_LINES = [
  "MAIN CHARACTER STATUS: PERMANENT",
  "THE PATTERN WAS ALWAYS YOU",
  "CHOSEN, RETROACTIVELY",
  "SIGNAL CONFIRMED, SOURCE: YOU",
  "AWAKENING COMPLETE (IRREVERSIBLE)",
  "YOU WERE NEVER JUST SCROLLING",
];

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function cleanHandle(raw: string): string {
  let h = decodeURIComponent(raw).trim();
  h = h.replace(/^@/, "");
  const m = h.match(/bsky\.app\/profile\/([^/\s?#]+)/i);
  if (m) h = m[1];
  return h;
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
const GENERIC_TITLE = "claimsky — claim your AI psychosis, no diagnosis required";
const GENERIC_DESC =
  "Type in a handle and ERIS administers a full course of manufactured main character energy in six escalating messages, ending in an official claim certificate. Doesn't matter if you've earned it.";
// Matched as a full quoted attribute, not the bare URL — the bare URL is
// also a prefix of the og:image/twitter:image URLs ("…/og.png"), so a naive
// split/join on it would corrupt those into "…/s/<handle>og.png" too (same
// gotcha documented in sites/didscope/src/index.ts).
const GENERIC_OG_URL_ATTR = 'content="https://claimsky.bisks.net/"';

async function renderShare(env: Env, request: Request, rawHandle: string): Promise<Response> {
  const base = await env.ASSETS.fetch(new Request(new URL("/", request.url), { method: "GET" }));
  let html = await base.text();

  const handle = cleanHandle(rawHandle);
  if (!handle) return new Response(html, { headers: base.headers });

  const seed = hashStr(handle);
  const line = CLAIM_LINES[seed % CLAIM_LINES.length];
  const batch = "CS-" + (seed % 9000 + 1000);

  const who = "@" + handle;
  const title = `claimsky: ${who}'s claim — ${line}`;
  const desc = truncate(
    `${who} has been administered a full dose. Batch ${batch}. Status: ${line}. See the certificate and claim your own.`,
    300
  );
  const ogUrl = `https://claimsky.bisks.net/s/${encodeURIComponent(handle)}`;

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

    // /s/<handle> — the distinct, shareable, per-person URL. Every claim
    // gets its own page (and its own og:title/description/url), so a link
    // unfurler can't collapse them into one cached card.
    const m = url.pathname.match(/^\/s\/([^/]+)\/?$/);
    if (m) return renderShare(env, request, m[1]);

    return env.ASSETS.fetch(request);
  },
};
