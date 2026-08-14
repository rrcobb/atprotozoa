// recordscope Worker — recordscope.bisks.net
//
// The whole reading still runs client-side (public/index.html does the real
// work: resolve → find PDS → getRecord → render). The one thing that needed
// a server: shared links. A plain static site serves the *same* index.html —
// same og:title/og:description/og:image — no matter which record is in the
// path, so a link-unfurl cache would show one generic card for every share,
// forever (same failure mode documented in sites/didscope's src/index.ts).
//
// Fix: /at/<did>/<collection>/<rkey> is a real, distinct URL per record. The
// Worker resolves the record's PDS server-side, fetches the record (and, for
// a whtwnd blog entry, its markdown blob for a real snippet), and stamps
// personalized og:title/og:description/og:url onto the same page shell
// before handing it back. Falls through to ASSETS for everything else
// (/, /og.png, /fonts/*, /lib/*).

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

const PLC_DIR = "https://plc.directory";

async function jget(url: string): Promise<any> {
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    cf: { cacheTtl: 60 } as unknown as Record<string, unknown>,
  });
  if (!res.ok) {
    const e: any = new Error(`HTTP ${res.status}`);
    e.status = res.status;
    throw e;
  }
  return res.json();
}

async function resolveDid(actor: string): Promise<string> {
  if (actor.startsWith("did:")) return actor;
  const r = await jget(`https://api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(actor)}`);
  if (!r.did) throw new Error(`couldn't resolve "${actor}"`);
  return r.did;
}

async function didDoc(did: string): Promise<any> {
  if (did.startsWith("did:plc:")) {
    const r = await fetch(`${PLC_DIR}/${did}`);
    return r.ok ? r.json() : null;
  }
  if (did.startsWith("did:web:")) {
    const domain = did.replace("did:web:", "").replace(/:/g, "/");
    const r = await fetch(`https://${domain}/.well-known/did.json`);
    return r.ok ? r.json() : null;
  }
  return null;
}

async function resolvePds(did: string): Promise<string | null> {
  try {
    const doc = await didDoc(did);
    const svc = (doc?.service || []).find(
      (s: any) => s.id === "#atproto_pds" || s.type === "AtprotoPersonalDataServer",
    );
    return svc?.serviceEndpoint || null;
  } catch {
    return null;
  }
}

async function getRecord(pds: string, repo: string, collection: string, rkey: string): Promise<any> {
  const params = new URLSearchParams({ repo, collection, rkey });
  return jget(`${pds.replace(/\/$/, "")}/xrpc/com.atproto.repo.getRecord?${params}`);
}

async function getBlobText(pds: string, did: string, cid: string): Promise<string> {
  const params = new URLSearchParams({ did, cid });
  const res = await fetch(`${pds.replace(/\/$/, "")}/xrpc/com.atproto.sync.getBlob?${params}`);
  if (!res.ok) throw new Error(`blob HTTP ${res.status}`);
  return res.text();
}

async function getProfile(did: string): Promise<any> {
  try {
    return await jget(`https://api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(did)}`);
  } catch {
    return null;
  }
}

function truncate(s: string, max: number): string {
  const arr = [...s];
  if (arr.length <= max) return s;
  return arr.slice(0, max - 1).join("").trimEnd() + "…";
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function snippetFromMarkdown(md: string, max: number): string {
  const plain = md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_>`#-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return truncate(plain, max);
}

// The static page's title/description phrase and og:url are identical across
// every <title>/og:*/twitter:* tag, so one string-replace-all each is enough
// to personalize the whole head — no HTML parser needed.
const GENERIC_TITLE = "recordscope — read any atproto record straight off its PDS";
const GENERIC_DESC =
  "Paste an AT-URI (or a whtwnd.com link) and read the record rendered straight off the owner's own PDS. Share the link instead of pasting the document.";
// Matched as a full quoted attribute, not the bare URL — the bare URL is
// also a prefix of the og:image/twitter:image URLs ("…/og.png"), so a naive
// split/join on it corrupted those too (see sites/didscope's src/index.ts).
const GENERIC_OG_URL_ATTR = 'content="https://recordscope.bisks.net/"';

async function renderShare(
  env: Env,
  request: Request,
  rawDid: string,
  rawCollection: string,
  rawRkey: string,
): Promise<Response> {
  const base = await env.ASSETS.fetch(new Request(new URL("/", request.url), { method: "GET" }));
  let html = await base.text();

  const actor = decodeURIComponent(rawDid);
  const collection = decodeURIComponent(rawCollection);
  const rkey = decodeURIComponent(rawRkey);
  if (!actor || !collection || !rkey) return new Response(html, { headers: base.headers });

  try {
    const did = await resolveDid(actor);
    const pds = await resolvePds(did);
    if (!pds) throw new Error("no PDS");

    const rec = await getRecord(pds, did, collection, rkey);
    const value = rec.value || {};
    const profile = await getProfile(did);
    const who = profile?.handle ? "@" + profile.handle : did;

    let title: string;
    let desc: string;

    if (value.$type === "com.whtwnd.blog.entry") {
      title = `recordscope: ${value.title || "an untitled note"} (by ${who})`;
      const content = value.content;
      let snippet = "";
      if (content && typeof content === "object" && content.$type === "blob") {
        const cid = content.ref?.["$link"] || content.ref;
        if (cid) {
          const text = await getBlobText(pds, did, cid);
          snippet = snippetFromMarkdown(text, 180);
        }
      } else if (typeof content === "string") {
        snippet = snippetFromMarkdown(content, 180);
      }
      desc = truncate(snippet || `A com.whtwnd.blog.entry record from ${who}'s PDS.`, 300);
    } else if (value.$type === "app.bsky.feed.post") {
      title = `recordscope: a post by ${who}`;
      desc = truncate(String(value.text || ""), 300);
    } else {
      title = `recordscope: ${collection} by ${who}`;
      const textish = ["title", "description", "text", "content", "body", "name", "displayName"]
        .map((k) => value[k])
        .find((v) => typeof v === "string");
      desc = truncate(textish || `A ${collection} record read straight off ${who}'s PDS.`, 300);
    }

    const ogUrl = `https://recordscope.bisks.net/at/${encodeURIComponent(did)}/${encodeURIComponent(collection)}/${encodeURIComponent(rkey)}`;

    html = html
      .split(GENERIC_TITLE).join(esc(title))
      .split(GENERIC_DESC).join(esc(desc))
      .split(GENERIC_OG_URL_ATTR).join(`content="${ogUrl}"`);

    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" },
    });
  } catch (_) {
    // Couldn't resolve/fetch the record server-side (typo, deleted record,
    // rate limit) — still serve the live page so the link isn't dead; the
    // client script will surface its own "couldn't load that" error.
    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" },
    });
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // /at/<did>/<collection>/<rkey> — the distinct, shareable, per-record
    // URL. Every combination gets its own page (and its own og:title/
    // description/url), so a link unfurler can't collapse them into one
    // cached card.
    const m = url.pathname.match(/^\/at\/([^/]+)\/([^/]+)\/([^/]+)\/?$/);
    if (m) return renderShare(env, request, m[1], m[2], m[3]);

    return env.ASSETS.fetch(request);
  },
};
