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

const PUB = "https://api.bsky.app/xrpc";

const FOLLOW_PAGES = 8; // cap ~800 follow records scanned, same order of
// magnitude as this repo's other GRAPH_PAGES caps (stanquiz, areyoumad).
const PROFILE_CONCURRENCY = 6;

// One generation = one year of account-creation gap. Bluesky's been around
// a few years at this point, so a year-wide band gives a handful of rows
// (parents/you/children) instead of one giant "everyone" bucket or hundreds
// of one-account rows.
const GEN_MS = 365.25 * 24 * 60 * 60 * 1000;

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
    entry.genOffset = offset;
    if (!rowsByOffset.has(offset)) rowsByOffset.set(offset, []);
    rowsByOffset.get(offset).push(entry);
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
  };
}
