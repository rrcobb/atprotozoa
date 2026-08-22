// census.js — turn a Bluesky handle into a TLD/length census of their moots
// (mutuals — follows ∩ followers). Reads Bluesky's PUBLIC AppView anonymously
// (public.api.bsky.app, CORS *, no auth): resolveHandle, getFollows,
// getFollowers, getProfile. Fetch/pagination copied+trimmed from
// beesky/public/lib/moots.js (copy, don't abstract) and extended with the
// TLD/segment/length breakdown @mfzx.net did by hand in the thread this site
// automates.

const PUB = "https://public.api.bsky.app/xrpc";

// 40 pages = up to ~4000 follows and ~4000 followers scanned per side. Plenty
// for a normal account; huge accounts get a capped-but-real census instead of
// an infinite crawl (see `capped` on the returned object).
const GRAPH_PAGES = 40;

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

async function graphAll(endpoint, key, did, onPage) {
  const out = [];
  let cursor = "";
  let p = 0;
  for (; p < GRAPH_PAGES; p++) {
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
  return { items: out, capped: Boolean(cursor) && p >= GRAPH_PAGES - 1 };
}

// Resolve a handle to its moot census. Returns:
//   { did, handle, mutuals: [{did, handle}], cappedFollows, cappedFollowers }
export async function census(actor, { onStep } = {}) {
  const did = await resolveDid(actor);

  if (onStep) onStep("finding who they follow…");
  const followsR = await graphAll(
    "app.bsky.graph.getFollows",
    "follows",
    did,
    (n) => onStep && onStep(`finding who they follow… (${n})`),
  );
  if (onStep) onStep("finding who follows them back…");
  const followersR = await graphAll(
    "app.bsky.graph.getFollowers",
    "followers",
    did,
    (n) => onStep && onStep(`finding who follows them back… (${n})`),
  );

  let handle = cleanHandle(actor);
  let avatar = "";
  let displayName = handle;
  try {
    const prof = await jget(
      `${PUB}/app.bsky.actor.getProfile?actor=${encodeURIComponent(did)}`,
    );
    handle = prof.handle || handle;
    avatar = prof.avatar || "";
    displayName = prof.displayName || handle;
  } catch {}

  const followerDids = new Set(followersR.items.map((f) => f.did));
  const seen = new Set([did]);
  const mutuals = [];
  for (const f of followsR.items) {
    if (!followerDids.has(f.did) || seen.has(f.did)) continue;
    seen.add(f.did);
    mutuals.push({ did: f.did, handle: f.handle });
  }

  return {
    did,
    handle,
    displayName,
    avatar,
    mutuals,
    cappedFollows: followsR.capped,
    cappedFollowers: followersR.capped,
  };
}

// The census @mfzx.net did by hand: TLD breakdown, segment-count breakdown,
// shortest/longest handles, average length. `handle.invalid` is a real
// AT Protocol state (the claimed handle's DNS/well-known record no longer
// verifies back to the DID) — those get counted separately instead of
// wrecking the TLD/length stats, same as the "2 invalid handles" line in
// the original thread.
export function analyze(mutuals) {
  const invalid = mutuals.filter((m) => !m.handle || m.handle === "handle.invalid");
  const valid = mutuals.filter((m) => m.handle && m.handle !== "handle.invalid");

  const tlds = new Map();
  const segments = new Map();
  let totalLen = 0;
  let shortestLen = Infinity;
  let longestLen = -Infinity;
  let shortest = [];
  let longest = [];

  for (const m of valid) {
    const h = m.handle;
    const parts = h.split(".");
    const tld = parts[parts.length - 1];
    tlds.set(tld, (tlds.get(tld) || 0) + 1);
    segments.set(parts.length, (segments.get(parts.length) || 0) + 1);
    totalLen += h.length;
    if (h.length < shortestLen) {
      shortestLen = h.length;
      shortest = [h];
    } else if (h.length === shortestLen) {
      shortest.push(h);
    }
    if (h.length > longestLen) {
      longestLen = h.length;
      longest = [h];
    } else if (h.length === longestLen) {
      longest.push(h);
    }
  }

  const tldList = [...tlds.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([tld, count]) => ({ tld, count }));
  const segmentList = [...segments.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([n, count]) => ({ segments: n, count }));

  return {
    total: mutuals.length,
    validCount: valid.length,
    invalidCount: invalid.length,
    uniqueTlds: tldList.length,
    singleTldCount: tldList.filter((t) => t.count === 1).length,
    singleTlds: tldList.filter((t) => t.count === 1).map((t) => t.tld),
    tldList,
    segmentList,
    shortest,
    longest,
    avgLength: valid.length ? totalLen / valid.length : 0,
  };
}
