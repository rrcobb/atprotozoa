// engagement.js — for the signed-in account, tally how many likes and direct
// replies every other account has ever given its posts, then split that
// tally against its moots (relegation candidates) and non-mutual followers
// (promotion candidates).
//
// The scan walks the signed-in account's OWN posts (bounded by however many
// posts they've ever made — fetched in one shot via fetchRepoRecordsWithKeys/
// com.atproto.sync.getRepo, see car.js and notes/40-new-site-playbook.md's
// cee.wtf bulk-read order), not everyone else's whole repo. That's the
// opposite of sites/innercircle's approach (which downloads every mutual's
// full repo to see how often *they've* replied to the searched handle) —
// here the natural bulk unit is "my own post history," and per-post
// engagement (getLikes, Cerulea backlinks) has no bulk-download equivalent
// of its own, so pagination there is the only option, exhausted to the end
// of the cursor every time, no page cap.

import { fetchRepoRecordsWithKeys } from "./car.js";

const PUB = "https://api.bsky.app/xrpc";
const CERULEA = "https://backlinks.cerulea.blue/xrpc/blue.cerulea.backlinks.listBacklinks";
const POST_TYPE = "app.bsky.feed.post";

// Backstop, not a budget — same treatment as the rest of the moot family
// (see notes/40-new-site-playbook.md, 2026-08-28 cap order): getFollows/
// getFollowers have no bulk-download equivalent, so this still paginates,
// but the number of pages it's willing to spend is not a correctness limit.
const GRAPH_PAGES = 400;

// Safety backstops, not defaults-out-of-caution: 100 items/page, so either
// number is far past what any real post's like/reply count reaches. Only
// exists so a misbehaving cursor that never terminates can't hang the tab.
const MAX_LIKE_PAGES = 2000;
const MAX_BACKLINK_PAGES = 2000;

// How many posts get scanned for likes+replies at once — a politeness/
// browser-memory pacing knob, not a cap on how many posts get scanned.
// Every post is still scanned, however many there are; this only paces how
// fast.
const CONCURRENCY = 8;

async function jget(url) {
  const r = await fetch(url, { headers: { Accept: "application/json" } });
  if (!r.ok) {
    const e = new Error(`HTTP ${r.status}`);
    e.status = r.status;
    throw e;
  }
  return r.json();
}

function didFromAtUri(uri) {
  const m = /^at:\/\/(did:[^/]+)\//.exec(uri || "");
  return m ? m[1] : null;
}

const profileOf = (p) => ({
  did: p.did,
  handle: p.handle,
  displayName: p.displayName || p.handle,
  avatar: p.avatar || "",
});

async function graphAll(endpoint, key, did) {
  const out = [];
  let cursor = "";
  for (let p = 0; p < GRAPH_PAGES; p++) {
    const u = new URL(`${PUB}/${endpoint}`);
    u.searchParams.set("actor", did);
    u.searchParams.set("limit", "100");
    if (cursor) u.searchParams.set("cursor", cursor);
    let d;
    try {
      d = await jget(u.toString());
    } catch {
      break;
    }
    for (const it of d[key] || []) out.push(it);
    cursor = d.cursor;
    if (!cursor) break;
  }
  return out;
}

// Resolves the signed-in account's moots (follow ∩ follow-back) and
// non-mutual followers (people who follow them that they don't follow back
// — the pool "promoting people to mutuals" draws replacements from).
export async function resolveGraph(did, { onStep } = {}) {
  if (onStep) onStep("mapping who you follow…");
  const follows = await graphAll("app.bsky.graph.getFollows", "follows", did);
  if (onStep) onStep("mapping who follows you back…");
  const followers = await graphAll("app.bsky.graph.getFollowers", "followers", did);

  const followDids = new Set(follows.map((f) => f.did));
  const followerDids = new Set(followers.map((f) => f.did));

  const moots = [];
  const seenMoot = new Set([did]);
  for (const f of follows) {
    if (!followerDids.has(f.did) || seenMoot.has(f.did)) continue;
    seenMoot.add(f.did);
    moots.push(profileOf(f));
  }

  const candidates = [];
  const seenCandidate = new Set([did]);
  for (const f of followers) {
    if (followDids.has(f.did) || seenCandidate.has(f.did)) continue;
    seenCandidate.add(f.did);
    candidates.push(profileOf(f));
  }

  return { moots, candidates };
}

// Every post the signed-in account has ever made, oldest first — one CAR
// download, no per-account page cap.
export async function fetchOwnPosts(session, onProgress) {
  const { records } = await fetchRepoRecordsWithKeys(
    session.pdsUrl,
    session.did,
    POST_TYPE,
    onProgress,
  );
  return records;
}

// Every liker of a post, exhausted to the end of the cursor. Returns a plain
// array of liker DIDs — getLikes' actor is already hydrated, but callers
// here only need the count, so no profile data is kept.
async function likersOf(uri) {
  const dids = [];
  let cursor;
  for (let page = 0; page < MAX_LIKE_PAGES; page++) {
    const u = new URL(`${PUB}/app.bsky.feed.getLikes`);
    u.searchParams.set("uri", uri);
    u.searchParams.set("limit", "100");
    if (cursor) u.searchParams.set("cursor", cursor);
    let d;
    try {
      d = await jget(u.toString());
    } catch {
      break;
    }
    for (const l of d.likes || []) {
      if (l?.actor?.did) dids.push(l.actor.did);
    }
    cursor = d.cursor;
    if (!cursor || !(d.likes || []).length) break;
  }
  return dids;
}

// Every DIRECT reply to a post (children whose $.reply.parent points at it),
// via Cerulea's full-network backlink index — same trick as
// sites/coliseum's lib/backlinks.js. Cerulea only indexes the reference, not
// content, which is exactly what's needed here: the reply's author DID is
// already encoded in its own AT-URI, so no per-reply hydration call is
// needed at all. Falls back to an empty list if Cerulea is unreachable for a
// given post — that post's replies are undercounted rather than the whole
// scan failing.
async function directReplierDidsOf(uri) {
  const dids = [];
  let cursor;
  for (let page = 0; page < MAX_BACKLINK_PAGES; page++) {
    const u = new URL(CERULEA);
    u.searchParams.set("target", uri);
    if (cursor) u.searchParams.set("cursor", cursor);
    let d;
    try {
      d = await jget(u.toString());
    } catch {
      break;
    }
    for (const group of d.backlinks || []) {
      if (group.location !== "$.reply.parent") continue;
      for (const replyUri of group.uris || []) {
        const rDid = didFromAtUri(replyUri);
        if (rDid) dids.push(rDid);
      }
    }
    cursor = d.cursor || undefined;
    if (!cursor) break;
  }
  return dids;
}

// Scans every post for likes+replies, bounded concurrency, and returns
// { likesByDid, repliesByDid } (Map<did, count>). onEach(done, total) fires
// as each post finishes so the UI can show live progress.
export async function scanEngagement(posts, onEach) {
  const likesByDid = new Map();
  const repliesByDid = new Map();
  const bump = (map, did) => map.set(did, (map.get(did) || 0) + 1);

  let next = 0;
  let done = 0;
  async function worker() {
    while (next < posts.length) {
      const post = posts[next++];
      const [likerDids, replierDids] = await Promise.all([
        likersOf(post.uri).catch(() => []),
        directReplierDidsOf(post.uri).catch(() => []),
      ]);
      for (const d of likerDids) bump(likesByDid, d);
      for (const d of replierDids) bump(repliesByDid, d);
      done++;
      if (onEach) onEach(done, posts.length);
    }
  }
  const workers = Array.from({ length: Math.min(CONCURRENCY, posts.length) }, worker);
  await Promise.all(workers);

  return { likesByDid, repliesByDid };
}
