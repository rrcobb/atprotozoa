// cluster.js — turn a Bluesky handle into its "simcluster" (mutuals) plus a
// cheap "adjacent" ring, for scoping a keyword search to people you actually
// know. Copied and trimmed from sites/moot-bingo/public/lib/moots.js (copy,
// don't abstract), which itself traces to sites/neighborhood/hood.js.
//
// core     = MUTUALS: follows ∩ followers (moots — your simcluster proper).
// adjacent = one-directional edges: people you follow who don't follow back,
//            plus people who follow you that you don't follow back. This is
//            deliberately NOT a second-degree crawl (moots-of-your-moots) —
//            that would mean re-running a full paginated getFollows/getFollowers
//            crawl for every one of a few hundred moots, i.e. turning one
//            person's graph crawl into a few hundred. The one-hop, one-way
//            edges are already sitting in the two lists this function fetches
//            anyway, so "adjacent" costs zero extra requests instead of ~2N.
//
// Everything here reads Bluesky's PUBLIC AppView anonymously (api.bsky.app,
// CORS *, no auth): resolveHandle, getFollows, getFollowers, getProfile.

const PUB = "https://api.bsky.app/xrpc";

// Backstop, not a budget — same value as kevinmoot/moot-bingo/etc: a fixed
// low page cap on getFollows/getFollowers was a speed knob dressed as a data
// cap, not a correctness bound. Raised repo-wide 2026-08-28.
const GRAPH_PAGES = 400;

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
    if (onStep) onStep(out.length);
    cursor = d.cursor;
    if (!cursor) break;
  }
  return out;
}

// Resolve a handle to its cluster. Returns:
//   { did, handle, self, core: [...], adjacent: [...], counts }
// `core` = moots (mutuals), `adjacent` = one-way follows/followers, both as
// [{did,handle,displayName,avatar}], self excluded from both.
export async function buildCluster(actor, { onStep } = {}) {
  const did = await resolveDid(actor);
  if (onStep) onStep("finding who they follow…");
  const follows = await graphAll(
    "app.bsky.graph.getFollows",
    "follows",
    did,
    (n) => onStep && onStep(`finding who they follow… (${n})`),
  );
  if (onStep) onStep("finding who follows them back…");
  const followers = await graphAll(
    "app.bsky.graph.getFollowers",
    "followers",
    did,
    (n) => onStep && onStep(`finding who follows them back… (${n})`),
  );

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

  const followMap = new Map(follows.map((f) => [f.did, f]));
  const followerMap = new Map(followers.map((f) => [f.did, f]));

  const core = [];
  const adjacent = [];
  const seen = new Set([did]);

  for (const f of follows) {
    if (seen.has(f.did)) continue;
    seen.add(f.did);
    if (followerMap.has(f.did)) core.push(profileOf(f));
    else adjacent.push(profileOf(f));
  }
  for (const f of followers) {
    if (seen.has(f.did)) continue;
    seen.add(f.did);
    adjacent.push(profileOf(f)); // followed-by, not followed-back -> one-way
  }

  return {
    did,
    handle: self.handle,
    self,
    core,
    adjacent,
    counts: {
      follows: follows.length,
      followers: followers.length,
      core: core.length,
      adjacent: adjacent.length,
    },
  };
}
