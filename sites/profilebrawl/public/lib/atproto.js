// atproto.js — read-side helper: resolve a handle/DID/URL to a full public
// profile, plus a recent-posts fetch for content-based judging. Copy, don't
// abstract: trimmed from sillympics's atproto.js (adds getAuthorFeed, which
// sillympics doesn't need since it only scores profile stats — profilebrawl
// needs the actual post content).

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

// Forgiving handle/DID/URL parsing, copied from alice-meets-bob's resolveDid.
export function normalizeActor(actor) {
  return (actor || "")
    .trim()
    .replace(/^@/, "")
    .replace(/^at:\/\//, "")
    .replace(/^https?:\/\/(bsky\.app\/profile\/)?/, "")
    .split("/")[0];
}

// Fetches the full public profile (app.bsky.actor.getProfile) for a
// handle, DID, or bsky.app profile URL. Throws if the actor can't be found.
export async function getProfile(actor) {
  const a = normalizeActor(actor);
  if (!a) throw new Error("empty handle");
  return jget(`${PUB}/app.bsky.actor.getProfile?actor=${encodeURIComponent(a)}`);
}

// Fetches up to `limit` (max 100 per page) of an account's own recent posts
// — reposts of other people's content are dropped (a repost isn't this
// account's writing or their picture), so what comes back is genuinely
// "things this account posted".
export async function getAuthorFeed(did, limit = 100) {
  const out = [];
  let cursor;
  while (out.length < limit) {
    const page = Math.min(100, limit - out.length);
    const url = `${PUB}/app.bsky.feed.getAuthorFeed?actor=${encodeURIComponent(did)}&limit=${page}&filter=posts_no_replies${
      cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""
    }`;
    const data = await jget(url);
    const items = (data.feed || []).filter((it) => !it.reason && it.post?.author?.did === did);
    out.push(...items.map((it) => it.post));
    if (!data.cursor || !data.feed?.length) break;
    cursor = data.cursor;
  }
  return out.slice(0, limit);
}
