// dial-a-mutual Worker — dial-a-mutual.bisks.net
//
// Everything still runs client-side (public/index.html + lib/moots.js do the
// real dialing and TTS). The one thing that needed a server: shared calls.
// A plain static site serves the *same* index.html — same og:title/
// og:description — no matter who got dialed, so Bluesky's link-unfurl cache
// shows one generic card forever no matter which call you share (same issue
// callout as sites/didscope's notes/45-sharing-and-virality.md, tier 4).
//
// Fix: /call/<selfHandle>/<mootHandle> is a real, distinct URL per call. The
// Worker resolves the moot's handle server-side, fetches their latest post
// (same lookup public/lib/moots.js does client-side), and stamps a
// personalized og:title/og:description/og:url onto the same page shell
// before handing it back — so every shared call gets its own preview card.
// The client script (public/index.html) then notices the /call/ path on load
// and replays the call for real: loads selfHandle's phonebook, finds
// mootHandle in it, and dials them automatically.
//
// Falls through to ASSETS for everything else (/, /og.png, /lib/*, /fonts/*).

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

const PUB = "https://public.api.bsky.app/xrpc/";

async function xrpc(method: string, params: Record<string, string>): Promise<any> {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(PUB + method + (qs ? "?" + qs : ""), {
    cf: { cacheTtl: 60 } as unknown as Record<string, unknown>,
  });
  if (!res.ok) throw new Error(`${method} ${res.status}`);
  return res.json();
}

function cleanHandle(raw: string): string {
  let h = decodeURIComponent(raw || "").trim();
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

// Mirrors public/lib/moots.js's latestPost(): most recent original text post,
// skipping reposts and anything with no words to read. Kept as a local
// server-side copy rather than a shared import — same reasoning as
// didscope/src/index.ts — this is duplication within ONE site, not a shared
// package across sites.
async function latestPost(did: string): Promise<{ text: string; url: string } | null> {
  const feed = await xrpc("app.bsky.feed.getAuthorFeed", {
    actor: did,
    limit: "50",
    filter: "posts_no_replies",
  });
  for (const item of feed.feed || []) {
    if (item.reason) continue; // skip reposts — we want THEIR voice
    const post = item.post;
    const text = post?.record?.text;
    if (!text || !text.trim()) continue;
    const handle = post.author?.handle;
    const rkey = String(post.uri || "").split("/").pop();
    return {
      text: text.trim(),
      url: `https://bsky.app/profile/${handle}/post/${rkey}`,
    };
  }
  return null;
}

// The static page's meta tags — these exact strings get swapped for the
// personalized versions. Keep in sync with public/index.html's <head>.
const GENERIC_OG_TITLE = "dial a mutual — call your moots' answering machine";
const GENERIC_OG_DESC =
  "Type a Bluesky handle to get a speed-dial keypad of its moots. Dial one and the machine picks up — it reads their latest post out loud, like an old answering machine.";
const GENERIC_TWITTER_DESC =
  "Speed-dial a Bluesky handle's moots. Whoever picks up gets their latest post read back out loud.";
const GENERIC_OG_URL = "https://dial-a-mutual.bisks.net/";

async function renderCall(
  env: Env,
  request: Request,
  rawSelf: string,
  rawMoot: string,
): Promise<Response> {
  const base = await env.ASSETS.fetch(new Request(new URL("/", request.url), { method: "GET" }));
  let html = await base.text();

  const selfHandle = cleanHandle(rawSelf);
  const mootHandle = cleanHandle(rawMoot);
  if (!selfHandle || !mootHandle) return new Response(html, { headers: base.headers });

  try {
    const { did } = await xrpc("com.atproto.identity.resolveHandle", { handle: mootHandle });
    const profile = await xrpc("app.bsky.actor.getProfile", { actor: did });
    const post = await latestPost(did);

    const displayName = profile.displayName || profile.handle || mootHandle;
    const title = `☎️ dial a mutual: ${displayName}'s answering machine`;
    const desc = post
      ? truncate(`"${post.text}" — dialed via @${selfHandle}'s phonebook on dial-a-mutual.`, 300)
      : `@${mootHandle}'s machine has nothing to play back right now — dial them yourself via @${selfHandle}'s phonebook.`;
    const ogUrl = `https://dial-a-mutual.bisks.net/call/${encodeURIComponent(selfHandle)}/${encodeURIComponent(mootHandle)}`;

    html = html
      .split(GENERIC_OG_TITLE).join(esc(title))
      .split(GENERIC_OG_DESC).join(esc(desc))
      .split(GENERIC_TWITTER_DESC).join(esc(desc))
      .split(GENERIC_OG_URL).join(ogUrl);

    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" },
    });
  } catch (_) {
    // Couldn't resolve server-side (typo, deleted account, rate limit) —
    // still serve the live page so the link isn't dead; the client script
    // will surface its own error when it tries the same lookup.
    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" },
    });
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // /call/<selfHandle>/<mootHandle> — the distinct, shareable, per-call
    // URL. Every combination gets its own og:title/description/url so a
    // link unfurler can't collapse different shared calls into one card.
    const m = url.pathname.match(/^\/call\/([^/]+)\/([^/]+)\/?$/);
    if (m) return renderCall(env, request, m[1], m[2]);

    return env.ASSETS.fetch(request);
  },
};
