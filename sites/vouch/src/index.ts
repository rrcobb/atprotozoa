// vouch Worker — served at the root of vouch.bisks.net.
//
// Everything real runs client-side (public/app.js): resolving handles,
// reading net.bisks.vouch.vouch records off a PDS, writing/deleting them via
// OAuth. The one thing that needs a server: shared links. A plain static
// site serves the *same* index.html — same og:title/description/image — no
// matter whose handle is in the URL, so Bluesky's link-unfurl cache would
// show one generic card for every share, forever. Fix: /u/<handle> is a
// real, distinct URL per person; this Worker resolves the handle, counts
// their vouches, and stamps personalized og:title/og:description/og:url onto
// the same page shell before handing it back. Same recipe as
// sites/didscope/src/index.ts's renderShare.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

const PLC_DIR = "https://plc.directory";
const APPVIEW = "https://public.api.bsky.app/xrpc";
const COLLECTION = "net.bisks.vouch.vouch";

function cleanHandle(raw: string): string {
  let h = decodeURIComponent(raw).trim();
  h = h.replace(/^@/, "");
  const m = h.match(/bsky\.app\/profile\/([^/\s?#]+)/i);
  if (m) h = m[1];
  return h;
}

async function xrpc(base: string, method: string, params: Record<string, string>): Promise<any> {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${base.replace(/\/$/, "")}/xrpc/${method}${qs ? "?" + qs : ""}`, {
    cf: { cacheTtl: 60 } as unknown as Record<string, unknown>,
  });
  if (!res.ok) throw new Error(`${method} ${res.status}`);
  return res.json();
}

async function resolvePds(did: string): Promise<string | null> {
  try {
    let doc: any = null;
    if (did.startsWith("did:plc:")) {
      const r = await fetch(`${PLC_DIR}/${did}`);
      if (r.ok) doc = await r.json();
    } else if (did.startsWith("did:web:")) {
      const domain = did.replace("did:web:", "").split(":").join("/");
      const r = await fetch(`https://${domain}/.well-known/did.json`);
      if (r.ok) doc = await r.json();
    }
    const svc = (doc?.service || []).find(
      (s: any) => s.id === "#atproto_pds" || s.type === "AtprotoPersonalDataServer",
    );
    return svc?.serviceEndpoint || null;
  } catch {
    return null;
  }
}

// Full listRecords walk of one small, single-user collection — no page cap,
// same reasoning as public/app.js's listVouches.
async function countVouches(pdsUrl: string, did: string): Promise<number> {
  let total = 0;
  let cursor: string | undefined;
  for (;;) {
    const params: Record<string, string> = { repo: did, collection: COLLECTION, limit: "100" };
    if (cursor) params.cursor = cursor;
    const data = await xrpc(pdsUrl, "com.atproto.repo.listRecords", params);
    const page = data.records || [];
    total += page.length;
    cursor = typeof data.cursor === "string" ? data.cursor : undefined;
    if (!cursor || !page.length) break;
  }
  return total;
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + "…";
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// The static page's title/description phrase and og:url are identical across
// every <title>/og:*/twitter:* tag, so one string-replace-all each is enough
// to personalize the whole head.
const GENERIC_TITLE = "vouch — who do you actually stand behind?";
const GENERIC_DESC =
  "sign in with Bluesky and vouch for anyone you find influential — a real record on your own PDS, one per person, public for anyone to look up. inspired by rektide's at-seven-ten.";
// Matched as a full quoted attribute, not the bare URL — the bare URL is
// also a prefix of the og:image/twitter:image URLs ("…/og.png"), so a naive
// split/join on it would corrupt those too (see sites/didscope's note on the
// same gotcha, caught in nothoney/skeetin/sidenote).
const GENERIC_OG_URL_ATTR = 'content="https://vouch.bisks.net/"';

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
      const r = await xrpc(APPVIEW, "com.atproto.identity.resolveHandle", { handle });
      did = r.did;
    }
    const profile = await xrpc(APPVIEW, "app.bsky.actor.getProfile", { actor: did });
    const pdsUrl = await resolvePds(did);
    const count = pdsUrl ? await countVouches(pdsUrl, did) : 0;

    const who = "@" + (profile.handle || handle);
    const title = `vouch: who ${who} stands behind`;
    const desc = truncate(
      `${who} vouches for ${count} ${count === 1 ? "person" : "people"} as influential. See who, or add your own vouch.`,
      300,
    );
    const ogUrl = `https://vouch.bisks.net/u/${encodeURIComponent(profile.handle || handle)}`;

    html = html
      .split(GENERIC_TITLE).join(esc(title))
      .split(GENERIC_DESC).join(esc(desc))
      .split(GENERIC_OG_URL_ATTR).join(`content="${ogUrl}"`);

    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" },
    });
  } catch (_) {
    // Couldn't resolve server-side (typo, deleted account, rate limit) —
    // still serve the live page so the link isn't dead; app.js surfaces its
    // own "couldn't look that up" error client-side.
    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" },
    });
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // /u/<handle> — the distinct, shareable, per-person URL. Every handle
    // gets its own page (and its own og:title/description/url), so a link
    // unfurler can't collapse them into one cached card.
    const m = url.pathname.match(/^\/u\/([^/]+)\/?$/);
    if (m) return renderShare(env, request, m[1]);

    return env.ASSETS.fetch(request);
  },
};
