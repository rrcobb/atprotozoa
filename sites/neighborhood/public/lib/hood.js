// hood.js — turn a Bluesky handle into its "neighborhood" and harvest posts.
//
// Neighborhood = MUTUALS: the accounts a handle follows that also follow back
// (follows ∩ followers). That's the set most likely to make three-word phrases
// recognizable — norvid's feedback on the trigram games was that a roster of
// strangers makes the dynamics feel random. If there aren't enough mutuals to
// fill a game, we widen to plain follows so it still plays.
//
// Everything here reads Bluesky's PUBLIC AppView anonymously (api.bsky.app,
// CORS *, no auth): resolveHandle, getFollows, getFollowers, getAuthorFeed.
// Trigram/clue helpers are copied from trigrams/unique.js (copy, don't abstract).

const PUB = "https://api.bsky.app/xrpc";

const GRAPH_PAGES = 12; // ≤ ~1200 follows + ~1200 followers scanned for mutuals
const MIN_POOL = 8; // below this, widen mutuals → follows so a game can run

async function jget(url) {
  const r = await fetch(url);
  if (!r.ok) {
    const e = new Error(`HTTP ${r.status}`);
    e.status = r.status;
    throw e;
  }
  return r.json();
}

// Resolve a handle / URL / @mention / DID to a DID. Forgiving about paste
// formats — copied from trigrams/unique.js resolveActor.
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
  if (!d.did) throw new Error(`couldn't resolve “${a}”`);
  return d.did;
}

const profileOf = (p) => ({
  did: p.did,
  handle: p.handle,
  displayName: p.displayName || p.handle,
  avatar: p.avatar || "",
});

// Page through a graph endpoint (getFollows / getFollowers), collecting the
// actor array under `key`. Stops at GRAPH_PAGES so a mega-account stays fast.
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

// Resolve a handle to its neighborhood. Returns:
//   { did, handle, self, pool: [{did,handle,displayName,avatar}], kind, counts }
// `pool` always includes the account itself (you recognize your own voice).
// `kind` is "mutuals" or "mutuals + follows" (the widen fallback).
export async function neighborhood(actor, { onStep } = {}) {
  const did = await resolveDid(actor);
  if (onStep) onStep("finding who they follow…");
  const follows = await graphAll("app.bsky.graph.getFollows", "follows", did);
  if (onStep) onStep("finding who follows them back…");
  const followers = await graphAll(
    "app.bsky.graph.getFollowers",
    "followers",
    did,
  );

  // self: pull display name / avatar so the account itself can appear in games.
  let self = {
    did,
    handle: actor.replace(/^@/, ""),
    displayName: actor.replace(/^@/, ""),
    avatar: "",
  };
  try {
    const prof = await jget(
      `${PUB}/app.bsky.actor.getProfile?actor=${encodeURIComponent(did)}`,
    );
    self = profileOf(prof);
  } catch {}

  const followerDids = new Set(followers.map((f) => f.did));
  const seen = new Set([did]); // never put self in twice
  const mutuals = [];
  for (const f of follows) {
    if (!followerDids.has(f.did) || seen.has(f.did)) continue;
    seen.add(f.did);
    mutuals.push(profileOf(f));
  }

  const mutualCount = mutuals.length;
  let kind = "mutuals";
  const pool = mutuals.slice();
  if (pool.length < MIN_POOL) {
    // widen: add plain follows (recognizable enough) to reach a playable pool
    for (const f of follows) {
      if (seen.has(f.did)) continue;
      seen.add(f.did);
      pool.push(profileOf(f));
    }
    if (pool.length > mutualCount) kind = "mutuals + follows";
  }
  // include self last so it's part of the pool but decoys favor others
  pool.push(self);

  return {
    did,
    handle: self.handle,
    self,
    pool,
    kind,
    counts: {
      follows: follows.length,
      followers: followers.length,
      mutuals: mutualCount,
      pool: pool.length,
    },
  };
}

// Recent post texts for one account via getAuthorFeed (anonymous). Skips
// reposts (item.reason) and replies (filter=posts_no_replies) so harvested
// phrases read as the account's own top-level voice. `pages` × up to 100 posts.
export async function authorPosts(did, { pages = 1 } = {}) {
  const texts = [];
  let cursor = "";
  for (let p = 0; p < pages; p++) {
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
    for (const it of d.feed || []) {
      if (it.reason) continue; // skip reposts
      const rec = it.post && it.post.record;
      if (rec && typeof rec.text === "string") texts.push(rec.text);
    }
    cursor = d.cursor;
    if (!cursor) break;
  }
  return texts;
}

// ── trigram / scoring helpers (copied from trigrams/unique.js) ─────────────────
const STOP = new Set(
  (
    "a an and are as at be been but by for from had has have he her his i in " +
    "is it its me my no not of on or our so that the their them then they this to up us was we were " +
    "what when who will with you your just like get got out about into over more all can do if im dont " +
    "youre they re ve ll s t m d re"
  ).split(/\s+/),
);

// Lowercase, drop URLs / @handles / #-marks, split on any non-letter/number run.
export function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/@[\w.-]+/g, " ")
    .replace(/[#]/g, " ")
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

// A gram's "interest" score: prefer content words + length. Used to ORDER which
// phrases become clues. All-stopword => -1 (dropped).
export function score(toks) {
  let s = 0,
    content = 0;
  for (const t of toks) {
    if (STOP.has(t)) s += 0.15;
    else {
      content++;
      s += Math.min(t.length, 12) / 4 + 1;
    }
  }
  return content === 0 ? -1 : s + content;
}
