// genealogy.js — turns "who you follow, in what order, and when their
// accounts were created" into a family tree.
//
// Two atproto reads, both public (no auth needed once we know the DID):
//   1. Your own app.bsky.graph.follow records, straight off your PDS via
//      com.atproto.repo.listRecords. This is the *true* follow order — the
//      order you actually followed people in — unlike app.bsky.graph.getFollows
//      on the AppView, which returns ProfileViews with no per-follow timestamp
//      and an unspecified/AppView-internal ordering. Sorted by rkey (a TID,
//      k-sortable and PDS-clock-assigned, so it's chronological even if a
//      record's own `createdAt` was backdated by a bulk-import tool) with
//      `createdAt` as a tiebreak/display value.
//   2. app.bsky.actor.getProfiles (batched, 25 DIDs/call) for each followed
//      account's `createdAt` — the account's own creation time. This repo's
//      established way to get "account age": see sites/stanquiz/public/lib/subject.js
//      and sites/immortals/public/lib/immortal.js. Some accounts (rare, old
//      migrations) don't have it populated — those land in a separate
//      "unknown era" bucket rather than being guessed at.
//
// Pattern (jget / paginate-with-cursor / batch-25) copied from
// sites/stanquiz/public/lib/subject.js and sites/moottris/public/lib/cluster.js.
//
// Descendant rows (children, grandchildren, ...) are handled differently
// from ancestor/peer rows: @ver.ooo's follow-up ask was that "your children's
// children should have to follow you (and grandchildren have to follow your
// children, etc)" — i.e. a younger account you follow only counts as your
// "child" if they follow you back, and their own younger followees only
// count as "grandchildren" if *they* follow the child back, and so on. That
// requires actually walking the live follow graph generation by generation
// (see buildDescendants below) rather than just age-bucketing your own
// follow list the way ancestor rows still do.

import { resolvePds } from "./oauth.js";

const PUB = "https://api.bsky.app/xrpc";

const FOLLOW_PAGES = 8; // cap ~800 follow records scanned, same order of
// magnitude as this repo's other GRAPH_PAGES caps (stanquiz, areyoumad).
const PROFILE_CONCURRENCY = 6;

// One generation = one year of account-creation gap. Bluesky's been around
// a few years at this point, so a year-wide band gives a handful of rows
// (parents/you/children) instead of one giant "everyone" bucket or hundreds
// of one-account rows. Still used for ancestor/peer rows; descendant rows
// use recursion depth instead (see buildDescendants).
const GEN_MS = 365.25 * 24 * 60 * 60 * 1000;

// Descendant-graph walk bounds. Each candidate costs a PDS lookup + a
// listRecords call just to check "do they follow back", so this is capped
// hard — a popular account's follow list could otherwise fan this out to
// thousands of live requests.
const DESCENT_MAX_DEPTH = 3; // children, grandchildren, great-grandchildren
const DESCENT_BREADTH = 6; // candidates checked per node, earliest-followed first
const DESCENT_BUDGET_START = 20; // total candidate checks across the whole walk
const DESCENT_CONCURRENCY = 4;
const DESCENT_PAGE_LIMIT = 100; // one page is enough to find "who they follow early on"

async function jget(url) {
  const r = await fetch(url);
  if (!r.ok) {
    const e = new Error(`HTTP ${r.status} on ${url}`);
    e.status = r.status;
    throw e;
  }
  return r.json();
}

function rkeyOf(uri) {
  return String(uri || "").split("/").pop() || "";
}

// All of the signed-in user's app.bsky.graph.follow records, oldest first.
// Public read straight off their PDS — no DPoP/auth needed, listRecords is a
// public endpoint. Returns [{ did, followedAt, order }], order = 0 for the
// very first account they ever followed.
export async function listFollowsInOrder(pdsUrl, did) {
  const out = [];
  let cursor;
  for (let p = 0; p < FOLLOW_PAGES; p++) {
    const params = new URLSearchParams({
      repo: did,
      collection: "app.bsky.graph.follow",
      limit: "100",
    });
    if (cursor) params.set("cursor", cursor);
    let d;
    try {
      d = await jget(
        `${pdsUrl.replace(/\/$/, "")}/xrpc/com.atproto.repo.listRecords?${params}`,
      );
    } catch {
      break;
    }
    const records = d.records || [];
    for (const rec of records) {
      const subject = rec.value?.subject;
      if (!subject) continue;
      out.push({
        did: subject,
        followedAt: rec.value?.createdAt || null,
        rkey: rkeyOf(rec.uri),
      });
    }
    cursor = d.cursor;
    if (!cursor || !records.length) break;
  }
  const truncated = out.length >= FOLLOW_PAGES * 100 && !!cursor;
  // rkey (TID) is PDS-clock-assigned and k-sortable, so it's a more honest
  // "when did this actually get written" than the record's own createdAt
  // field, which a bulk-import client could have backdated.
  out.sort((a, b) => (a.rkey < b.rkey ? -1 : a.rkey > b.rkey ? 1 : 0));
  out.forEach((f, i) => (f.order = i));
  return { follows: out, truncated };
}

// Batch-fetch profiles (handle, displayName, avatar, createdAt) for up to 25
// DIDs at a time. Missing/failed chunks are just skipped — a partial tree
// beats a dead page.
export async function getProfiles(dids) {
  const byDid = new Map();
  const chunks = [];
  for (let i = 0; i < dids.length; i += 25) chunks.push(dids.slice(i, i + 25));

  let next = 0;
  async function worker() {
    while (next < chunks.length) {
      const chunk = chunks[next++];
      const u = new URL(`${PUB}/app.bsky.actor.getProfiles`);
      for (const d of chunk) u.searchParams.append("actors", d);
      try {
        const d = await jget(u.toString());
        for (const p of d.profiles || []) byDid.set(p.did, p);
      } catch {
        // skip this chunk of 25; the rest still render
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(PROFILE_CONCURRENCY, chunks.length) }, worker),
  );
  return byDid;
}

// Single page of someone's follow records — no pagination, just enough to
// find "who they followed early on" for a descendant candidate pool. Same
// shape as listFollowsInOrder's `follows`, minus the truncated flag.
async function listFollowsPage(pdsUrl, did, limit) {
  const params = new URLSearchParams({
    repo: did,
    collection: "app.bsky.graph.follow",
    limit: String(limit),
  });
  const d = await jget(
    `${pdsUrl.replace(/\/$/, "")}/xrpc/com.atproto.repo.listRecords?${params}`,
  );
  const records = d.records || [];
  const out = [];
  for (const rec of records) {
    const subject = rec.value?.subject;
    if (!subject) continue;
    out.push({ did: subject, followedAt: rec.value?.createdAt || null, rkey: rkeyOf(rec.uri) });
  }
  out.sort((a, b) => (a.rkey < b.rkey ? -1 : a.rkey > b.rkey ? 1 : 0));
  out.forEach((f, i) => (f.order = i));
  return out;
}

async function mapWithConcurrency(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

// Walks the descendant graph: for each candidate (a younger account the
// current node follows), verify they follow the node back before counting
// them as a "child" — then recurse into *their* follows to look for
// "grandchildren" the same way, one real edge at a time. Bounded by depth,
// per-node breadth, and a shared fetch budget (see constants above).
async function descendLevel(parent, candidates, depth, state) {
  if (depth > DESCENT_MAX_DEPTH) return;
  const pool = candidates.filter((c) => !state.visited.has(c.did)).slice(0, DESCENT_BREADTH);
  if (!pool.length) return;

  await mapWithConcurrency(pool, DESCENT_CONCURRENCY, async (c) => {
    if (state.budget <= 0) {
      state.exhausted = true;
      return;
    }
    state.budget--;
    state.visited.add(c.did);

    let childPdsUrl, childFollows;
    try {
      childPdsUrl = await resolvePds(c.did);
      if (!childPdsUrl) return;
      childFollows = await listFollowsPage(childPdsUrl, c.did, DESCENT_PAGE_LIMIT);
    } catch {
      return; // unresolvable PDS/repo — can't verify, so they don't count
    }

    const followsBack = childFollows.some((f) => f.did === parent.did);
    if (!followsBack) return; // the whole point of this pass: no back-follow, no lineage

    state.out.push({
      did: c.did,
      handle: c.p.handle,
      displayName: c.p.displayName || c.p.handle,
      avatar: c.p.avatar || "",
      createdAt: c.p.createdAt || null,
      followOrder: c.followOrder,
      followedAt: c.followedAt,
      depth,
    });

    if (depth >= DESCENT_MAX_DEPTH || state.budget <= 0) return;

    const nextDids = childFollows.map((f) => f.did).filter((d) => !state.visited.has(d));
    if (!nextDids.length) return;
    const nextProfiles = await getProfiles(nextDids);
    const nextCandidates = [];
    for (const f of childFollows) {
      if (state.visited.has(f.did)) continue;
      const p = nextProfiles.get(f.did);
      if (!p) continue;
      const createdMs = p.createdAt ? Date.parse(p.createdAt) : NaN;
      if (!Number.isFinite(createdMs) || createdMs <= c.createdMs) continue; // must be younger still
      nextCandidates.push({ did: f.did, followOrder: f.order, followedAt: f.followedAt, p, createdMs });
    }
    await descendLevel({ did: c.did, createdMs: c.createdMs }, nextCandidates, depth + 1, state);
  });
}

// seedCandidates = the owner's own followees who are younger than the owner
// (already profiled, no extra fetch needed for depth 1). Returns
// { entries, exhausted } — entries carry `depth` (1 = child, 2 = grandchild, ...).
async function buildDescendants(root, seedCandidates) {
  const state = { budget: DESCENT_BUDGET_START, out: [], visited: new Set([root.did]), exhausted: false };
  await descendLevel(root, seedCandidates, 1, state);
  return { entries: state.out, exhausted: state.exhausted };
}

function labelFor(offset) {
  if (offset === 0) return "Your Generation";
  const abs = Math.abs(offset);
  const older = offset > 0;
  if (abs === 1) return older ? "Parents" : "Children";
  if (abs === 2) return older ? "Grandparents" : "Grandchildren";
  if (abs <= 6) {
    const greats = "Great-".repeat(abs - 2);
    return older ? `${greats}Grandparents` : `${greats}Grandchildren`;
  }
  return older ? "The Elders (deep ancestry)" : "The Newest Branch";
}

// Build the whole lineage: your own profile + generation-bucketed, follow-
// ordered rows of everyone you follow. `onProgress(stage)` is optional, for
// a status line while the two network passes run.
export async function buildLineage(session, onProgress) {
  onProgress?.("reading your follow records…");
  const { follows, truncated } = await listFollowsInOrder(session.pdsUrl, session.did);

  onProgress?.(`looking up ${follows.length} account${follows.length === 1 ? "" : "s"}…`);
  const allDids = [session.did, ...follows.map((f) => f.did)];
  const profiles = await getProfiles(allDids);

  const you = profiles.get(session.did) || {
    did: session.did,
    handle: session.handle,
    displayName: session.handle,
  };
  const youCreatedMs = you.createdAt ? Date.parse(you.createdAt) : NaN;

  const rowsByOffset = new Map();
  const unknownEra = [];
  // Owner's own followees who are younger than the owner — the seed pool for
  // the graph-verified descendant walk below, not bucketed on age alone.
  const descentSeeds = [];

  for (const f of follows) {
    const p = profiles.get(f.did);
    if (!p) continue; // deactivated/blocked/unresolvable — skip, don't guess
    const entry = {
      did: f.did,
      handle: p.handle,
      displayName: p.displayName || p.handle,
      avatar: p.avatar || "",
      createdAt: p.createdAt || null,
      followOrder: f.order,
      followedAt: f.followedAt,
    };
    const createdMs = p.createdAt ? Date.parse(p.createdAt) : NaN;
    if (!Number.isFinite(createdMs) || !Number.isFinite(youCreatedMs)) {
      unknownEra.push(entry);
      continue;
    }
    // Positive offset = created before you (older account -> ancestor row).
    const offset = Math.round((youCreatedMs - createdMs) / GEN_MS);
    if (offset < 0) {
      descentSeeds.push({ did: f.did, followOrder: f.order, followedAt: f.followedAt, p, createdMs });
      continue;
    }
    entry.genOffset = offset;
    if (!rowsByOffset.has(offset)) rowsByOffset.set(offset, []);
    rowsByOffset.get(offset).push(entry);
  }

  onProgress?.("checking who follows back for children/grandchildren…");
  const { entries: descendants, exhausted: descentExhausted } = await buildDescendants(
    { did: you.did, createdMs: youCreatedMs },
    descentSeeds,
  );
  for (const d of descendants) {
    const offset = -d.depth;
    if (!rowsByOffset.has(offset)) rowsByOffset.set(offset, []);
    rowsByOffset.get(offset).push({
      did: d.did,
      handle: d.handle,
      displayName: d.displayName,
      avatar: d.avatar,
      createdAt: d.createdAt,
      followOrder: d.followOrder,
      followedAt: d.followedAt,
      genOffset: offset,
    });
  }

  for (const list of rowsByOffset.values()) list.sort((a, b) => a.followOrder - b.followOrder);
  unknownEra.sort((a, b) => a.followOrder - b.followOrder);

  const rows = Array.from(rowsByOffset.entries())
    .sort((a, b) => b[0] - a[0]) // oldest generation (highest offset) first, at the top
    .map(([offset, members]) => ({ offset, label: labelFor(offset), members }));

  return {
    you: {
      did: you.did,
      handle: you.handle,
      displayName: you.displayName || you.handle,
      avatar: you.avatar || "",
      createdAt: you.createdAt || null,
    },
    rows,
    unknownEra,
    followCount: follows.length,
    truncated,
    descentExhausted,
  };
}
