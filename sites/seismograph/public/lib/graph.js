// graph.js — turn a Bluesky handle into its "unrequited follows": the accounts
// it FOLLOWS but who do NOT follow back. One-way follows. The people you're
// reaching toward who haven't reached back.
//
//   unrequited = follows − followers   (set difference, one direction)
//
// Everything here reads Bluesky's PUBLIC AppView anonymously (api.bsky.app,
// CORS *, no auth): resolveHandle, getFollows, getFollowers, getProfile(s).
// Copied and re-diffed from simcluster/moots.js (copy, don't abstract) — same
// paging machinery, opposite set operation.

const PUB = "https://api.bsky.app/xrpc";

const GRAPH_PAGES = 400; // backstop, not a budget — raised 2026-08-28 across the moot-family sites (same treatment as kevinmoot's bfs.js FOLLOWERS_PAGES; a fixed page count on getFollows/getFollowers was a speed knob dressed as a data cap, not a correctness bound)

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
// formats — copied from simcluster/moots.js resolveDid.
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
  // getFollows entries rarely carry followersCount; we backfill it below so the
  // spike heights mean something.
  followersCount:
    typeof p.followersCount === "number" ? p.followersCount : null,
});

// Page through a graph endpoint (getFollows / getFollowers), collecting the
// actor array under `key`. Stops at GRAPH_PAGES so a mega-account stays fast.
async function graphAll(endpoint, key, did, onPage) {
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
    if (onPage) onPage(out.length);
    cursor = d.cursor;
    if (!cursor) break;
  }
  return out;
}

// getProfiles takes up to 25 actors per call. Fill followersCount in place for
// (at most) the first CAP entries so spike heights mean something.
const CAP = 300; // cap the drawn/weighed set so a follow-everyone account stays fast
async function backfillCounts(list, onStep) {
  const targets = list.slice(0, CAP);
  for (let i = 0; i < targets.length; i += 25) {
    const batch = targets.slice(i, i + 25);
    const u = new URL(`${PUB}/app.bsky.actor.getProfiles`);
    for (const p of batch) u.searchParams.append("actors", p.did);
    let d;
    try {
      d = await jget(u.toString());
    } catch {
      continue;
    }
    const byDid = new Map((d.profiles || []).map((pr) => [pr.did, pr]));
    for (const p of batch) {
      const pr = byDid.get(p.did);
      if (pr && typeof pr.followersCount === "number") {
        p.followersCount = pr.followersCount;
      }
    }
    if (onStep)
      onStep(`weighing the silence… ${Math.min(i + 25, targets.length)}`);
  }
}

// Resolve a handle to its unrequited follows. Returns:
//   { did, handle, self, oneway: [{did,handle,displayName,avatar,weight,followersCount}],
//     counts: { follows, followers, oneway, weighed } }
// `oneway` is sorted biggest-account-first so the loudest twitches lead.
// `weight` is 0..1, log-scaled from followersCount, and drives spike height.
export async function unrequited(actor, { onStep } = {}) {
  const did = await resolveDid(actor);

  if (onStep) onStep("reading who they follow…");
  const follows = await graphAll(
    "app.bsky.graph.getFollows",
    "follows",
    did,
    (n) => onStep && onStep(`reading who they follow… ${n}`),
  );

  if (onStep) onStep("reading who follows them back…");
  const followers = await graphAll(
    "app.bsky.graph.getFollowers",
    "followers",
    did,
    (n) => onStep && onStep(`reading who follows them back… ${n}`),
  );

  // self: display name / avatar for the header.
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
  const seen = new Set([did]);
  const oneway = [];
  for (const f of follows) {
    if (followerDids.has(f.did) || seen.has(f.did)) continue; // they DO follow back → skip
    seen.add(f.did);
    oneway.push(profileOf(f));
  }

  // getFollows entries don't carry followersCount, so twitch height would be
  // flat. Backfill counts for a bounded slice (the ones that get drawn).
  if (oneway.length) {
    if (onStep) onStep("weighing the silence…");
    await backfillCounts(oneway, onStep);
  }

  // weight: log-scale followersCount into 0..1 so a 200k account towers over a
  // 40-follower one without the tiny accounts vanishing into the baseline.
  const counts = oneway
    .map((p) => p.followersCount)
    .filter((n) => typeof n === "number" && n > 0);
  const maxLog = counts.length ? Math.log10(Math.max(...counts) + 1) : 1;
  let weighed = 0;
  for (const p of oneway) {
    if (typeof p.followersCount === "number") weighed++;
    const c = typeof p.followersCount === "number" ? p.followersCount : 0;
    p.weight = maxLog > 0 ? Math.log10(c + 1) / maxLog : 0.5;
  }

  // biggest accounts first — loudest twitches lead.
  oneway.sort((a, b) => (b.followersCount || 0) - (a.followersCount || 0));

  return {
    did,
    handle: self.handle,
    self,
    oneway,
    counts: {
      follows: follows.length,
      followers: followers.length,
      oneway: oneway.length,
      weighed,
    },
  };
}
