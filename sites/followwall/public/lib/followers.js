// followers.js — resolve a handle, fetch its profile, and page through its
// full follower list. Reads Bluesky's public AppView anonymously
// (public.api.bsky.app, CORS *). Handle-resolution copied from
// sites/clucktrack/public/lib/history.js (copy, don't abstract); the
// getFollowers paging is new.

const PUB = "https://public.api.bsky.app/xrpc";

// Hard cap so a mega-account (millions of followers) doesn't turn one page
// load into thousands of requests — plenty to fill a wall and compute stats.
const MAX_PAGES = 40; // 40 * 100 = up to 4000 followers

async function jget(url) {
  const r = await fetch(url);
  if (!r.ok) {
    const e = new Error(`HTTP ${r.status}`);
    e.status = r.status;
    throw e;
  }
  return r.json();
}

export function cleanHandle(actor) {
  return (actor || "")
    .trim()
    .replace(/^@/, "")
    .replace(/^at:\/\//, "")
    .replace(/^https?:\/\/(bsky\.app\/profile\/)?/, "")
    .split("/")[0];
}

export async function resolveDid(actor) {
  const a = cleanHandle(actor);
  if (!a) throw new Error("empty handle");
  if (a.startsWith("did:")) return a;
  const d = await jget(
    `${PUB}/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(a)}`,
  );
  if (!d.did) throw new Error(`couldn't resolve "${a}"`);
  return d.did;
}

export async function fetchProfile(did) {
  const p = await jget(`${PUB}/app.bsky.actor.getProfile?actor=${encodeURIComponent(did)}`);
  return {
    did: p.did,
    handle: p.handle,
    displayName: p.displayName || p.handle,
    avatar: p.avatar || "",
    description: p.description || "",
    followersCount: p.followersCount || 0,
    followingCount: p.followsCount || 0,
    postsCount: p.postsCount || 0,
  };
}

// Every follower of `did`, newest-first (the order the AppView returns),
// capped at MAX_PAGES pages.
export async function fetchFollowers(did, { onStep } = {}) {
  const followers = [];
  let cursor = "";
  for (let pg = 0; pg < MAX_PAGES; pg++) {
    if (onStep) onStep(`reading followers… (page ${pg + 1}, ${followers.length} found so far)`);
    const u = new URL(`${PUB}/app.bsky.graph.getFollowers`);
    u.searchParams.set("actor", did);
    u.searchParams.set("limit", "100");
    if (cursor) u.searchParams.set("cursor", cursor);
    let d;
    try {
      d = await jget(u.toString());
    } catch {
      break;
    }
    for (const f of d.followers || []) {
      followers.push({
        did: f.did,
        handle: f.handle,
        displayName: f.displayName || f.handle,
        avatar: f.avatar || "",
        description: f.description || "",
      });
    }
    cursor = d.cursor;
    if (!cursor || !(d.followers || []).length) break;
  }
  return followers;
}
