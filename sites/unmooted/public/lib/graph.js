// graph.js — resolve a handle and page through its follows/followers via
// Bluesky's public AppView. Copied and trimmed from
// sites/mootspy/public/lib/spy-data.js (copy, don't abstract) — unmooted only
// needs the raw follows/followers lists and a profile lookup, not the
// moots-vs-decoys split mootspy builds on top of them.

const PUB = "https://api.bsky.app/xrpc";

const GRAPH_PAGES = 400; // backstop, not a budget — see notes on the moot-family sites: getFollows/getFollowers have no bulk-download equivalent, so this still has to paginate, but the page count is a speed knob, not a correctness bound.

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

export const profileOf = (p) => ({
  did: p.did,
  handle: p.handle,
  displayName: p.displayName || p.handle,
  avatar: p.avatar || "",
});

export async function getProfile(did) {
  const p = await jget(`${PUB}/app.bsky.actor.getProfile?actor=${encodeURIComponent(did)}`);
  return profileOf(p);
}

// Page through a graph endpoint (getFollows / getFollowers), collecting the
// actor array under `key`. Stops at GRAPH_PAGES so a mega-account stays fast.
// Returns { items, truncated } — truncated means the cap was hit while the
// AppView still had more pages to give.
export async function graphAll(endpoint, key, did) {
  const out = [];
  let cursor = "";
  let truncated = false;
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
    if (p === GRAPH_PAGES - 1) truncated = true;
  }
  return { items: out, truncated };
}

export async function getFollows(did) {
  return graphAll("app.bsky.graph.getFollows", "follows", did);
}
export async function getFollowers(did) {
  return graphAll("app.bsky.graph.getFollowers", "followers", did);
}
