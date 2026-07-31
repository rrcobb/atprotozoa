// mootree Worker — mootree.bisks.net.
//
// The tree itself still builds entirely client-side (public/index.html +
// public/lib/genealogy.js do the real work, for *anyone's* handle — see
// public/lib/identity.js's resolvePublicActor). The one thing that needs a
// server: shared links.
//
// A plain static site serves the same index.html — same og:title/
// og:description/og:image — no matter whose handle is in the URL, so
// Bluesky's link-unfurl cache would show one generic card for every share,
// forever (same problem notes/45-sharing-and-virality.md and didscope hit).
//
// Fix: /t/<handle> is a real, distinct URL per person. The Worker resolves
// the handle server-side, does a bounded version of the same generation
// count genealogy.js computes client-side, and stamps personalized
// og:title/og:description/og:url onto the same page shell before handing it
// back — so every share gets its own cache entry and its own preview text.
// The client script also recognizes /t/<handle> on load and renders that
// person's actual tree — there's no sign-in anywhere on this site, viewing
// (anyone's, including your own) is always this same public read. Falls
// through to ASSETS for everything else (/, /og.png, /lib/*).

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

const PUB = "https://api.bsky.app/xrpc";
const PLC_DIR = "https://plc.directory";

// Bounded, cheaper than the client's full read (FOLLOW_PAGES=8 there): this
// is just for a share-card blurb, not the live page, and Workers have a
// subrequest budget. A few hundred follows is plenty to characterize
// someone's generational spread for a preview.
const FOLLOW_PAGES = 3;
const GEN_MS = 365.25 * 24 * 60 * 60 * 1000;

async function jget(url: string): Promise<any> {
  const r = await fetch(url, { cf: { cacheTtl: 60 } as unknown as Record<string, unknown> });
  if (!r.ok) throw new Error(`HTTP ${r.status} on ${url}`);
  return r.json();
}

async function resolveDid(handleOrDid: string): Promise<string> {
  if (handleOrDid.startsWith("did:")) return handleOrDid;
  const d = await jget(`${PUB}/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handleOrDid)}`);
  if (!d.did) throw new Error("could not resolve handle");
  return d.did;
}

async function resolvePds(did: string): Promise<string> {
  let doc: any = null;
  if (did.startsWith("did:plc:")) {
    doc = await jget(`${PLC_DIR}/${did}`);
  } else if (did.startsWith("did:web:")) {
    const domain = did.replace("did:web:", "").replace(/:/g, "/");
    doc = await jget(`https://${domain}/.well-known/did.json`);
  }
  const pds = (doc?.service || []).find(
    (s: any) => s.id === "#atproto_pds" || s.type === "AtprotoPersonalDataServer",
  );
  if (!pds?.serviceEndpoint) throw new Error("could not resolve PDS");
  return pds.serviceEndpoint;
}

async function listFollows(pdsUrl: string, did: string): Promise<string[]> {
  const dids: string[] = [];
  let cursor: string | undefined;
  for (let p = 0; p < FOLLOW_PAGES; p++) {
    const params = new URLSearchParams({ repo: did, collection: "app.bsky.graph.follow", limit: "100" });
    if (cursor) params.set("cursor", cursor);
    let d: any;
    try {
      d = await jget(`${pdsUrl.replace(/\/$/, "")}/xrpc/com.atproto.repo.listRecords?${params}`);
    } catch {
      break;
    }
    const records = d.records || [];
    for (const rec of records) if (rec.value?.subject) dids.push(rec.value.subject);
    cursor = d.cursor;
    if (!cursor || !records.length) break;
  }
  return dids;
}

async function getProfiles(dids: string[]): Promise<Map<string, any>> {
  const byDid = new Map<string, any>();
  for (let i = 0; i < dids.length; i += 25) {
    const chunk = dids.slice(i, i + 25);
    const u = new URL(`${PUB}/app.bsky.actor.getProfiles`);
    for (const d of chunk) u.searchParams.append("actors", d);
    try {
      const d = await jget(u.toString());
      for (const p of d.profiles || []) byDid.set(p.did, p);
    } catch {
      // skip this chunk; a partial sample still makes a fine blurb
    }
  }
  return byDid;
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + "…";
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Every og:title/og:description/og:url tag in public/index.html carries this
// exact generic string, so one string-replace-all each personalizes the
// whole head — no HTML parser needed. Keep these in sync with index.html.
const GENERIC_TITLE = "mootree — a family tree of your bluesky moots";
const GENERIC_DESC =
  "Grow a family tree out of anyone's Bluesky moots — just type a handle, nothing to sign in to. Rows are generations, sorted by account age; within a row, birth order is the order they actually followed people in.";
// Anchored with the surrounding attribute quote + tag close so this can't
// also match inside og:image/twitter:image ("https://mootree.bisks.net/og.png"
// starts with the same prefix, and a bare split/join on the prefix alone
// would silently corrupt those two tags).
const GENERIC_OG_URL_ATTR = 'content="https://mootree.bisks.net/" />';

async function renderShare(env: Env, request: Request, rawHandle: string): Promise<Response> {
  const base = await env.ASSETS.fetch(new Request(new URL("/", request.url), { method: "GET" }));
  let html = await base.text();

  const handle = decodeURIComponent(rawHandle).trim().replace(/^@/, "");
  if (!handle) return new Response(html, { headers: base.headers });

  try {
    const did = await resolveDid(handle);
    const pdsUrl = await resolvePds(did);
    const followDids = await listFollows(pdsUrl, did);
    const profiles = await getProfiles([did, ...followDids]);

    const you = profiles.get(did);
    const handleOut = you?.handle || handle;
    const youCreatedMs = you?.createdAt ? Date.parse(you.createdAt) : NaN;

    let elders = 0, peers = 1, younger = 0; // peers starts at 1: the tree's own owner
    for (const d of followDids) {
      const p = profiles.get(d);
      const createdMs = p?.createdAt ? Date.parse(p.createdAt) : NaN;
      if (!Number.isFinite(createdMs) || !Number.isFinite(youCreatedMs)) continue;
      const offset = Math.round((youCreatedMs - createdMs) / GEN_MS);
      if (offset > 0) elders++;
      else if (offset < 0) younger++;
      else peers++;
    }

    const title = `mootree: @${handleOut}'s family tree`;
    const desc = truncate(
      followDids.length
        ? `${elders} elders, ${peers} in their own generation, ${younger} younger — grown from @${handleOut}'s actual Bluesky moots, oldest follow first.`
        : `@${handleOut} doesn't follow anyone yet — nothing to grow a tree from.`,
      300,
    );
    const ogUrl = `https://mootree.bisks.net/t/${encodeURIComponent(handleOut)}`;

    html = html
      .split(GENERIC_TITLE).join(esc(title))
      .split(GENERIC_DESC).join(esc(desc))
      .split(GENERIC_OG_URL_ATTR).join(`content="${ogUrl}" />`);

    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" },
    });
  } catch {
    // Couldn't resolve server-side (typo, deleted account, rate limit) —
    // still serve the live page so the link isn't dead; the client script
    // will surface its own "couldn't resolve that" error.
    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" },
    });
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // /t/<handle> — the distinct, shareable, per-person URL. Every
    // combination gets its own page (own og:title/description/url), so a
    // link unfurler can't collapse them into one cached card.
    const m = url.pathname.match(/^\/t\/([^/]+)\/?$/);
    if (m) return renderShare(env, request, m[1]);

    return env.ASSETS.fetch(request);
  },
};
