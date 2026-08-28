// pool.js — resolve the crawl target into a common pool of profiles:
// either a Bluesky handle (-> its mutuals) or an app.bsky.graph.list
// URL/AT-URI (-> its members). Everything reads Bluesky's PUBLIC AppView
// anonymously (api.bsky.app, CORS *, no auth). The mutuals half is copied
// and trimmed from simcluster/lib/moots.js (copy, don't abstract); the list
// half is new.

const PUB = "https://api.bsky.app/xrpc";

const GRAPH_PAGES = 400; // backstop, not a budget — raised 2026-08-28 across the moot-family sites (same treatment as kevinmoot's bfs.js FOLLOWERS_PAGES; a fixed page count on getFollows/getFollowers was a speed knob dressed as a data cap, not a correctness bound)
const MIN_MUTUALS = 8; // below this, widen mutuals -> follows so there's a real graph to crawl
export const MAX_POOL = 50; // keep the downstream likes-crawl bounded

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

async function mutualsPool(actor, onStep) {
  const did = await resolveDid(actor);
  if (onStep) onStep("finding who they follow…");
  const follows = await graphAll("app.bsky.graph.getFollows", "follows", did);
  if (onStep) onStep("finding who follows them back…");
  const followers = await graphAll(
    "app.bsky.graph.getFollowers",
    "followers",
    did,
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

  const followerDids = new Set(followers.map((f) => f.did));
  const seen = new Set([did]);
  const mutuals = [];
  for (const f of follows) {
    if (!followerDids.has(f.did) || seen.has(f.did)) continue;
    seen.add(f.did);
    mutuals.push(profileOf(f));
  }

  let full = mutuals;
  let kind = "mutuals";
  if (full.length < MIN_MUTUALS) {
    // widen: a graph over 3 mutuals has nothing to find. Add plain follows
    // so there's at least a real pool to crawl likes over.
    const widened = full.slice();
    for (const f of follows) {
      if (seen.has(f.did)) continue;
      seen.add(f.did);
      widened.push(profileOf(f));
    }
    if (widened.length > full.length) {
      full = widened;
      kind = "mutuals + follows";
    }
  }

  return {
    kind,
    label: `@${self.handle}'s ${kind}`,
    subject: self,
    full,
  };
}

function parseListRef(input) {
  const s = (input || "").trim();
  let m = s.match(
    /^at:\/\/([^/]+)\/app\.bsky\.graph\.list\/([a-zA-Z0-9._-]+)/,
  );
  if (m) return { actor: m[1], rkey: m[2] };
  m = s.match(/bsky\.app\/profile\/([^/?#]+)\/lists\/([a-zA-Z0-9._-]+)/);
  if (m) return { actor: decodeURIComponent(m[1]), rkey: m[2] };
  return null;
}

export function looksLikeList(input) {
  return !!parseListRef(input);
}

async function listPool(input, onStep) {
  const ref = parseListRef(input);
  if (!ref) throw new Error("couldn't parse that as a list link");
  if (onStep) onStep("resolving the list owner…");
  const ownerDid = await resolveDid(ref.actor);
  const listUri = `at://${ownerDid}/app.bsky.graph.list/${ref.rkey}`;

  if (onStep) onStep("reading list members…");
  const members = [];
  let cursor = "";
  let listName = "";
  for (let p = 0; p < GRAPH_PAGES; p++) {
    const u = new URL(`${PUB}/app.bsky.graph.getList`);
    u.searchParams.set("list", listUri);
    u.searchParams.set("limit", "100");
    if (cursor) u.searchParams.set("cursor", cursor);
    const d = await jget(u.toString());
    listName = (d.list && d.list.name) || listName;
    for (const it of d.items || []) {
      if (it.subject) members.push(profileOf(it.subject));
    }
    cursor = d.cursor;
    if (!cursor) break;
  }
  if (!members.length) throw new Error("that list has no members (or doesn't exist)");

  return {
    kind: "list",
    label: listName ? `the "${listName}" list` : "that list",
    subject: { did: ownerDid, handle: ref.actor, displayName: listName || ref.actor, avatar: "" },
    full: members,
  };
}

// Resolve free-text input to a bounded pool ready for the likes crawl.
// Returns { kind, label, subject, pool, overflow, totalFound, truncated }.
// `overflow` is the next MAX_POOL candidates past the cap — spare members
// held in reserve to swap in for anyone the likes crawl finds is
// low-activity (see likes.js backfillLowActivity).
export async function resolvePool(input, { onStep } = {}) {
  const raw = looksLikeList(input)
    ? await listPool(input, onStep)
    : await mutualsPool(input, onStep);
  const totalFound = raw.full.length;
  const pool = raw.full.slice(0, MAX_POOL);
  const overflow = raw.full.slice(MAX_POOL, MAX_POOL + MAX_POOL);
  return {
    kind: raw.kind,
    label: raw.label,
    subject: raw.subject,
    pool,
    overflow,
    totalFound,
    truncated: totalFound > pool.length,
  };
}
