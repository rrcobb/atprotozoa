// mechpilot Worker — mechpilot.bisks.net
//
// The card generator itself is entirely client-side (public/index.html does
// the real work: resolve handle -> profile -> draw a mech-pilot trading card
// on a <canvas>). Two small server jobs, same shape as sites/didscope +
// sites/mootrider:
//
// 1. /s/<handle> — a plain static site serves the same index.html (same
//    og:title/description/image) no matter whose handle is in the URL, so
//    Bluesky's link-unfurl cache would show one generic card for every
//    share, forever. This route is a real, distinct URL per person: the
//    Worker resolves the handle server-side and stamps a personalized
//    og:title/og:description/og:url onto the same page shell before handing
//    it back. og:image stays the static public/og.png sample card — Workers
//    have no native canvas/SVG rasterizer to draw a real one per person
//    server-side, and that's the client's job anyway.
//
// 2. /api/avatar — cdn.bsky.app sends no Access-Control-Allow-Origin, so a
//    crossOrigin="anonymous" <img> fetch of an avatar always fails and the
//    share-card canvas would silently fall back to a plain colored initial.
//    This same-origin proxy lets the client draw the real avatar into the
//    cockpit without tainting the canvas. Locked to cdn.bsky.app so it can't
//    be used as an open image proxy.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

const API = "https://public.api.bsky.app/xrpc/";
const AVATAR_HOST = "cdn.bsky.app";

async function xrpc(method: string, params: Record<string, string>): Promise<any> {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(API + method + (qs ? "?" + qs : ""), {
    cf: { cacheTtl: 60 } as unknown as Record<string, unknown>,
  });
  if (!res.ok) throw new Error(`${method} ${res.status}`);
  return res.json();
}

function cleanHandle(raw: string): string {
  let h = decodeURIComponent(raw).trim();
  h = h.replace(/^@/, "");
  const m = h.match(/bsky\.app\/profile\/([^/\s?#]+)/i);
  if (m) h = m[1];
  return h;
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + "…";
}

// Same class/callsign derivation as public/index.html's card generator —
// kept as a small, deliberately duplicated copy (server-side needs only the
// two flavor strings for the OG text, not the full card-drawing code).
const CLASSES = ["VANGUARD", "INTERCEPTOR", "JUGGERNAUT", "WRAITH", "ARTILLERY", "WARDEN"];
const CALL_ADJ = [
  "IRON", "NULL", "GHOST", "CRIMSON", "SILENT", "ROGUE", "LAST", "ASH",
  "NEON", "HOLLOW", "STORM", "RUST", "PALE", "GRIM", "LONE", "FERAL",
];
const CALL_NOUN = [
  "WOLF", "VIPER", "FALCON", "COMET", "ANVIL", "REAPER", "HORNET", "WRAITH",
  "MANTIS", "JACKAL", "TALON", "ECHO", "CINDER", "RAVEN", "SPECTER", "LYNX",
];

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function didUniquePart(did: string): string {
  const parts = did.split(":");
  return parts.length > 2 ? parts.slice(2).join(":") : did;
}

function deriveFlavor(did: string) {
  const uid = didUniquePart(did);
  const h = hashStr(uid);
  const cls = CLASSES[h % CLASSES.length];
  const adj = CALL_ADJ[(h >>> 4) % CALL_ADJ.length];
  const noun = CALL_NOUN[(h >>> 9) % CALL_NOUN.length];
  return { cls, callsign: `${adj} ${noun}` };
}

const GENERIC_TITLE = "mechpilot — your handle, piloting a mech";
const GENERIC_DESC =
  "Enter a Bluesky handle and get a real mech-pilot trading card: a procedurally built mech, a callsign, and stats pulled from the account itself — followers, posts, and sortie tempo.";
const GENERIC_OG_URL = "https://mechpilot.bisks.net/";

async function renderShare(env: Env, request: Request, rawHandle: string): Promise<Response> {
  const base = await env.ASSETS.fetch(new Request(new URL("/", request.url), { method: "GET" }));
  let html = await base.text();

  const handle = cleanHandle(rawHandle);
  if (!handle) return new Response(html, { headers: base.headers });

  try {
    let did: string;
    if (handle.startsWith("did:")) {
      did = handle;
    } else {
      const r = await xrpc("com.atproto.identity.resolveHandle", { handle });
      did = r.did;
    }
    const profile = await xrpc("app.bsky.actor.getProfile", { actor: did });
    const { cls, callsign } = deriveFlavor(did);

    const who = "@" + (profile.handle || handle);
    const title = `mechpilot: ${who} — ${callsign} (${cls})`;
    const desc = truncate(
      `${who}'s mech-pilot card: callsign "${callsign}", ${cls} class. Stats built from ${profile.followersCount ?? 0} followers, ${profile.postsCount ?? 0} posts. Generate your own —`,
      300
    );
    const ogUrl = `https://mechpilot.bisks.net/s/${encodeURIComponent(handle)}`;

    html = html
      .split(GENERIC_TITLE).join(esc(title))
      .split(GENERIC_DESC).join(esc(desc))
      .split(GENERIC_OG_URL).join(ogUrl);

    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" },
    });
  } catch (_) {
    // Couldn't resolve the handle server-side (typo, deleted account, rate
    // limit) — still serve the live page so the link isn't dead; the client
    // script will surface its own "couldn't resolve that" error.
    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" },
    });
  }
}

async function proxyAvatar(request: Request): Promise<Response> {
  const target = new URL(request.url).searchParams.get("u") || "";
  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    return new Response("bad url", { status: 400 });
  }
  if (parsed.protocol !== "https:" || parsed.hostname !== AVATAR_HOST) {
    return new Response("host not allowed", { status: 400 });
  }
  const upstream = await fetch(parsed.toString());
  if (!upstream.ok || !upstream.body) {
    return new Response("upstream error", { status: 502 });
  }
  return new Response(upstream.body, {
    status: 200,
    headers: {
      "content-type": upstream.headers.get("content-type") || "image/jpeg",
      "cache-control": "public, max-age=86400",
      "access-control-allow-origin": "*",
    },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/avatar") {
      return proxyAvatar(request);
    }

    // /s/<handle> — the distinct, shareable, per-person URL. Every combination
    // gets its own page (and its own og:title/description/url), so a link
    // unfurler can't collapse them into one cached card.
    const m = url.pathname.match(/^\/s\/([^/]+)\/?$/);
    if (m) return renderShare(env, request, m[1]);

    return env.ASSETS.fetch(request);
  },
};
