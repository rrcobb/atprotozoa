// atproto.js — read-side helpers: identity resolution + public feed reads.
// Everything here hits public, unauthenticated endpoints — no session
// needed, this site never writes anything.
//
// Copy, don't abstract: trimmed from sites/vulnscope/public/lib/atproto.js.

const PUB = "https://public.api.bsky.app/xrpc";

async function jget(url) {
  const r = await fetch(url, { headers: { Accept: "application/json" } });
  if (!r.ok) {
    const e = new Error(`HTTP ${r.status}`);
    e.status = r.status;
    throw e;
  }
  return r.json();
}

// Forgiving handle/DID/URL parsing, copied from vulnscope's resolveDid.
export async function resolveDid(actor) {
  const a = (actor || "")
    .trim()
    .replace(/^@/, "")
    .replace(/^at:\/\//, "")
    .replace(/^https?:\/\/(bsky\.app\/profile\/)?/, "")
    .split("/")[0];
  if (!a) throw new Error("empty handle");
  if (a.startsWith("did:")) return a;
  const d = await jget(
    `${PUB}/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(a)}`,
  );
  if (!d.did) throw new Error(`couldn't resolve "${a}"`);
  return d.did;
}

export async function getProfile(did) {
  return jget(`${PUB}/app.bsky.actor.getProfile?actor=${encodeURIComponent(did)}`);
}

// Recent original posts (no replies, no reposts) — the raw material a
// thumbnail gets built from. Newest-first, capped to a couple pages.
export async function getRecentPosts(did, capPages = 2) {
  const out = [];
  let cursor;
  for (let p = 0; p < capPages; p++) {
    const u = new URL(`${PUB}/app.bsky.feed.getAuthorFeed`);
    u.searchParams.set("actor", did);
    u.searchParams.set("limit", "100");
    u.searchParams.set("filter", "posts_no_replies");
    if (cursor) u.searchParams.set("cursor", cursor);
    let d;
    try {
      d = await jget(u.toString());
    } catch {
      break;
    }
    const items = d.feed || [];
    out.push(...items);
    cursor = d.cursor;
    if (!cursor || !items.length) break;
  }
  return out
    .filter((it) => !it.reason) // drop reposts
    .map((it) => it.post?.record?.text)
    .filter((t) => typeof t === "string" && t.trim().length > 0);
}
