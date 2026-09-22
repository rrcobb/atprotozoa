// atproto.js — read-side helpers: identity resolution and public AppView
// reads. Everything here hits public, unauthenticated endpoints — no session
// needed, this site never writes anything.
//
// Copy, don't abstract: trimmed from sites/vulnscope/public/lib/atproto.js
// down to just what a mood ring needs (no PDS/follow-graph reads).

const PUB = "https://api.bsky.app/xrpc";

async function jget(url) {
  const r = await fetch(url, { headers: { Accept: "application/json" } });
  if (!r.ok) {
    const e = new Error(`HTTP ${r.status}`);
    e.status = r.status;
    throw e;
  }
  return r.json();
}

// Forgiving handle/DID/URL parsing, copied from moot-bingo's resolveDid.
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

// The last 10 posts/replies, newest first. This is the literal thing the ask
// specifies ("based on the tone of the last 10 posts/replies") — the request
// itself bounds the read, so one page of 10 (no pagination loop) is the
// right amount of data, not an arbitrary cap. Reposts are excluded (a
// repost carries someone else's tone, not this account's); replies and
// quote posts are kept since they carry this account's own words.
export async function getLastTenPosts(did) {
  const u = new URL(`${PUB}/app.bsky.feed.getAuthorFeed`);
  u.searchParams.set("actor", did);
  u.searchParams.set("limit", "10");
  u.searchParams.set("filter", "posts_with_replies");
  const d = await jget(u.toString());
  return (d.feed || [])
    .filter((it) => !it.reason) // drop reposts
    .map((it) => it.post)
    .filter(Boolean);
}
