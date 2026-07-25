// pool.js — build a guessing pool of accounts from Bluesky's public graph, and
// harvest "bisks" (posts) from them to use as guess-the-author clues.
//
// Two pool shapes:
//   soloPool(actor)        — everyone `actor` follows (+ actor itself).
//   versusPool(a, b)       — the SET UNION of what `a` and `b` each follow
//                            (+ both a and b themselves).
//
// Everything here reads Bluesky's PUBLIC AppView anonymously (api.bsky.app,
// CORS *, no auth): resolveHandle, getFollows, getProfile, getAuthorFeed.
// Trimmed from neighborhood/hood.js (copy, don't abstract) — this version
// wants plain FOLLOWS, not the follows∩followers "moots" cut.

const PUB = "https://api.bsky.app/xrpc";

const GRAPH_PAGES = 12; // ≤ ~1200 follows scanned per account

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
// formats — copied from hood.js resolveDid.
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

async function getProfile(did) {
  const p = await jget(
    `${PUB}/app.bsky.actor.getProfile?actor=${encodeURIComponent(did)}`,
  );
  return profileOf(p);
}

// Page through getFollows, collecting profiles. Stops at GRAPH_PAGES so a
// mega-account stays fast.
async function getAllFollows(did) {
  const out = [];
  let cursor = "";
  for (let p = 0; p < GRAPH_PAGES; p++) {
    const u = new URL(`${PUB}/app.bsky.graph.getFollows`);
    u.searchParams.set("actor", did);
    u.searchParams.set("limit", "100");
    if (cursor) u.searchParams.set("cursor", cursor);
    let d;
    try {
      d = await jget(u.toString());
    } catch {
      break;
    }
    for (const f of d.follows || []) out.push(profileOf(f));
    cursor = d.cursor;
    if (!cursor) break;
  }
  return out;
}

// Solo mode: the pool is everyone `actor` follows, plus actor itself (you
// know your own voice too). Returns { did, handle, self, pool, counts }.
export async function soloPool(actor, { onStep } = {}) {
  const did = await resolveDid(actor);
  if (onStep) onStep(`finding who @${actor.replace(/^@/, "")} follows…`);
  const follows = await getAllFollows(did);

  let self = { did, handle: actor.replace(/^@/, ""), displayName: actor.replace(/^@/, ""), avatar: "" };
  try {
    self = await getProfile(did);
  } catch {}

  const seen = new Set([did]);
  const pool = [];
  for (const f of follows) {
    if (seen.has(f.did)) continue;
    seen.add(f.did);
    pool.push(f);
  }
  pool.push(self);

  return {
    handle: self.handle,
    self,
    pool,
    label: `@${self.handle}'s follows`,
    counts: { follows: follows.length, pool: pool.length },
  };
}

// Versus mode: the pool is the SET UNION of what `a` and `b` each follow,
// plus a and b themselves. Returns { handleA, handleB, selfA, selfB, pool }.
export async function versusPool(actorA, actorB, { onStep } = {}) {
  const didA = await resolveDid(actorA);
  const didB = await resolveDid(actorB);

  if (onStep) onStep(`finding who @${actorA.replace(/^@/, "")} follows…`);
  const followsA = await getAllFollows(didA);
  if (onStep) onStep(`finding who @${actorB.replace(/^@/, "")} follows…`);
  const followsB = await getAllFollows(didB);

  let selfA = { did: didA, handle: actorA.replace(/^@/, ""), displayName: actorA.replace(/^@/, ""), avatar: "" };
  let selfB = { did: didB, handle: actorB.replace(/^@/, ""), displayName: actorB.replace(/^@/, ""), avatar: "" };
  try {
    selfA = await getProfile(didA);
  } catch {}
  try {
    selfB = await getProfile(didB);
  } catch {}

  const seen = new Set();
  const pool = [];
  for (const f of [...followsA, ...followsB]) {
    if (seen.has(f.did)) continue;
    seen.add(f.did);
    pool.push(f);
  }
  for (const s of [selfA, selfB]) {
    if (seen.has(s.did)) continue;
    seen.add(s.did);
    pool.push(s);
  }

  return {
    handleA: selfA.handle,
    handleB: selfB.handle,
    selfA,
    selfB,
    pool,
    label: `@${selfA.handle} ∪ @${selfB.handle}`,
    counts: { followsA: followsA.length, followsB: followsB.length, pool: pool.length },
  };
}

// Recent top-level post texts for one account, via getAuthorFeed (anonymous).
// Skips reposts (item.reason) and replies (filter=posts_no_replies).
export async function authorPosts(did, { pages = 2 } = {}) {
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

// Pick usable bisks for a round: real sentences, not link-only or blank posts,
// and nothing that names the author outright (that would give the game away).
export function pickBisks(actor, texts, { need = 5, minLen = 20 } = {}) {
  const nameNeedles = [actor.handle.split(".")[0], ...(actor.displayName || "").split(/\s+/)]
    .map((s) => s.toLowerCase().trim())
    .filter((s) => s.length >= 3);

  const clean = (t) => t.replace(/\s+/g, " ").trim();
  const usable = [];
  const seen = new Set();
  for (const raw of texts) {
    const t = clean(raw);
    if (t.length < minLen) continue;
    const stripped = t.replace(/https?:\/\/\S+/g, "").trim();
    if (stripped.length < minLen * 0.6) continue; // mostly a bare link
    if (seen.has(t)) continue;
    const low = t.toLowerCase();
    if (nameNeedles.some((n) => low.includes(n))) continue; // would give it away
    seen.add(t);
    usable.push(t);
  }
  // longer bisks tend to read as more "recognizably them" — bias toward those,
  // but keep some variety instead of always the five longest.
  usable.sort((a, b) => b.length - a.length);
  const pick = usable.slice(0, Math.max(need * 3, need));
  // shuffle the shortlist so repeat rounds for the same secret don't repeat
  for (let i = pick.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pick[i], pick[j]] = [pick[j], pick[i]];
  }
  return pick.slice(0, need);
}
