// moots.js — resolve a handle to itself + its moots (mutuals: accounts it
// follows that also follow it back), with full profiles (avatar included).
// Public AppView only (api.bsky.app, CORS *, no auth) — the follow graph
// and avatars are public data. Copied and trimmed from
// sites/mootpocalypse/public/lib/moots.js (itself from mootrider/cluster.js
// — copy, don't abstract).
//
// getFollows/getFollowers aren't repo-backed, so there's no bulk CAR
// download equivalent for them (see notes/40-new-site-playbook.md's standing
// order on bulk reads) — pagination here is the correct approach, not a
// habitual-caution leftover. No page cap: a real mutuals list shouldn't be
// silently truncated.

const PUB = "https://api.bsky.app/xrpc";

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
// formats — copied from neighborhood/hood.js resolveDid.
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

const profileOf = (p) => ({
  did: p.did,
  handle: p.handle,
  displayName: p.displayName || p.handle,
  avatar: p.avatar || "",
});

async function graphAll(endpoint, key, did) {
  const out = [];
  let cursor = "";
  while (true) {
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

// Resolve `actor` to its moots: { did, pool, kind, counts }. `pool` is
// mutuals (without self) with full profiles attached, widened to plain
// follows if the mutual set is too small to fill a hopper.
export async function moots(actor, { onStep } = {}) {
  if (onStep) onStep("resolving handle…");
  const did = await resolveDid(actor);
  if (onStep) onStep("mapping who you follow…");
  const follows = await graphAll("app.bsky.graph.getFollows", "follows", did);
  if (onStep) onStep("mapping who follows you back…");
  const followers = await graphAll("app.bsky.graph.getFollowers", "followers", did);

  const followerDids = new Set(followers.map((f) => f.did));
  const seen = new Set([did]);
  const mutuals = [];
  for (const f of follows) {
    if (!followerDids.has(f.did) || seen.has(f.did)) continue;
    seen.add(f.did);
    mutuals.push(profileOf(f));
  }

  const mutualCount = mutuals.length;
  let kind = "moots";
  const pool = mutuals.slice();
  const MIN_POOL = 6;
  if (pool.length < MIN_POOL) {
    for (const f of follows) {
      if (seen.has(f.did)) continue;
      seen.add(f.did);
      pool.push(profileOf(f));
    }
    if (pool.length > mutualCount) kind = "moots + follows";
  }

  return {
    did,
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
