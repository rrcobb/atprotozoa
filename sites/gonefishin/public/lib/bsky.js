// bsky.js — turn a Bluesky handle into a fishing pool: everyone they follow,
// tagged with whether the follow is a moot (mutual: follows ∩ followers).
//
// Reads Bluesky's PUBLIC AppView anonymously (public.api.bsky.app, CORS *,
// no auth): resolveHandle, getFollows, getFollowers, getProfile. Copied and
// trimmed from moot-bingo/public/lib/moots.js (copy, don't abstract).

const PUB = "https://public.api.bsky.app/xrpc";

const GRAPH_PAGES = 8; // <= ~800 follows + ~800 followers scanned per pond

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
// formats — copied from moot-bingo/moots.js resolveDid.
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

const profileOf = (p) => ({
  did: p.did,
  handle: p.handle,
  displayName: p.displayName || p.handle,
  avatar: p.avatar || "",
});

// Page through a graph endpoint (getFollows / getFollowers), collecting the
// actor array under `key`. Stops at GRAPH_PAGES so a mega-account stays fast.
async function graphAll(endpoint, key, did, onStep) {
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
    if (onStep) onStep(out.length);
    if (!cursor) break;
  }
  return out;
}

// Resolve a handle to its fishing pond: { did, profile, pool, counts }.
// `pool` is every follow, each tagged `moot: true` if they follow back —
// there's no widening fallback here (unlike moot-bingo): a small pond of a
// handful of follows is still a perfectly fine pond to fish in.
export async function findPond(actor, { onStep } = {}) {
  const did = await resolveDid(actor);
  if (onStep) onStep("finding your profile…");
  const profile = profileOf(await getProfile(did));

  if (onStep) onStep("finding who you follow…");
  const follows = await graphAll("app.bsky.graph.getFollows", "follows", did, (n) =>
    onStep && onStep(`finding who you follow… (${n})`),
  );
  if (onStep) onStep("finding who follows you back…");
  const followers = await graphAll("app.bsky.graph.getFollowers", "followers", did, (n) =>
    onStep && onStep(`finding who follows you back… (${n})`),
  );

  const followerDids = new Set(followers.map((f) => f.did));
  const seen = new Set([did]);
  const pool = [];
  for (const f of follows) {
    if (seen.has(f.did)) continue;
    seen.add(f.did);
    pool.push({ ...profileOf(f), moot: followerDids.has(f.did) });
  }

  const moots = pool.filter((p) => p.moot).length;
  return {
    did,
    profile,
    pool,
    counts: { follows: pool.length, followers: followers.length, moots },
  };
}
