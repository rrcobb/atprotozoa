// rank.js — the actual pipeline. @personhood.removal.surgery asked (via a
// reply tagging the bot, in a thread where @vikanezrimaya.xyz said "probably
// 99% of block backlinks on my profile is .bsky.social handles"): enter a
// handle, find every blocklist your blocks are on, rank them by how many of
// your blocks vs. how many of your follows they contain, and show what share
// of each list's own membership is a default .bsky.social handle.
//
// Blocks and follows are records in your OWN repo (public there even though
// the AppView won't compute "who blocks whom" for privacy — see
// sites/blockcurve's constellation.js header), so step 1 is one repo CAR
// download, not a paginated listRecords walk (2026-08-25 bulk-reads order).
// "Which lists is a blocked account on" has no repo-level answer though — a
// listitem lives in the *list owner's* repo, not the member's — so that part
// leans on constellation.microcosm.blue's backlink index instead (see
// constellation.js). Once a list is a genuine blocklist candidate, its own
// full membership (for the follow-overlap count and the .bsky.social share)
// comes from the reverse side of that same index.

import { resolveHandle, resolvePds, pooledEach, getHandles, jget } from "./identity.js";
import { fetchRepoRecordsWithKeys } from "./car.js";
import { fetchListMemberships, fetchListMembers, getListRecord, listWebUrl, CONSTELLATION_INDEXED_SINCE_MS } from "./constellation.js";

const FETCH_CONCURRENCY = 8; // browser connection-pool courtesy, not a data cap
const FALLBACK_PAGES = 400; // paginated listRecords fallback if the CAR read fails — same backstop value as kevinmoot's GRAPH_PAGES, see notes/40-new-site-playbook.md 2026-08-28
const SHARE_SAMPLE_SIZE = 300; // a percentage doesn't need a full census — 300 resolved handles is plenty for a stable estimate, and keeps getProfiles calls from scaling with a mega-list's true size (same "sample for an estimate, census for a count" split as the vulnscope precedent in notes/40-new-site-playbook.md)

// Discovery can genuinely turn up thousands of candidate lists — verified
// live against pfrazee.com (477 blocks, 8591 candidate lists): blocking even
// a couple of widely-recognized bad actors is enough, since those accounts
// each sit on huge numbers of independent personal blocklists. Fully reading
// every candidate's membership (a paginated walk each) doesn't scale to that
// — this isn't habitual caution, it's a real "would never finish in a
// browser tab" case. So: triage by the discovery pass's own by-product,
// hitCount (how many distinct blocked accounts landed on that list) — a
// list every blocked account's on is exactly the kind of list this tool
// exists to surface, so ranking candidates by that signal before doing the
// expensive full read costs nothing and can only demote lists that were
// already going to rank low. Only the top MAX_CANDIDATES get fully read;
// the rest are dropped with a visible count, never silently.
const MAX_CANDIDATES = 200;

async function fetchOwnRecords(did) {
  const pds = await resolvePds(did);
  if (pds) {
    try {
      const { records } = await fetchRepoRecordsWithKeys(pds, did, ["app.bsky.graph.block", "app.bsky.graph.follow"]);
      return records;
    } catch {
      // fall through to the paginated walk below
    }
  }
  // Fallback: page com.atproto.repo.listRecords directly against the PDS
  // (public AppView doesn't implement this method for arbitrary repos).
  const out = [];
  if (!pds) return out;
  for (const collection of ["app.bsky.graph.block", "app.bsky.graph.follow"]) {
    let cursor = "";
    for (let p = 0; p < FALLBACK_PAGES; p++) {
      const u = new URL(pds.replace(/\/$/, "") + "/xrpc/com.atproto.repo.listRecords");
      u.searchParams.set("repo", did);
      u.searchParams.set("collection", collection);
      u.searchParams.set("limit", "100");
      if (cursor) u.searchParams.set("cursor", cursor);
      let d;
      try {
        d = await jget(u.toString());
      } catch {
        break;
      }
      for (const r of d.records || []) out.push({ uri: r.uri, value: r.value });
      cursor = d.cursor;
      if (!cursor || !(d.records || []).length) break;
    }
  }
  return out;
}

export async function rankBlocklists(rawHandle, { onProgress } = {}) {
  const step = (msg) => onProgress && onProgress(msg);

  step("resolving handle…");
  const { did, handle, profile } = await resolveHandle(rawHandle);

  step(`reading @${handle}'s blocks + follows…`);
  const records = await fetchOwnRecords(did);
  const blockedDids = new Set();
  const followDids = new Set();
  for (const r of records) {
    if (!r.value) continue;
    if (r.value.$type === "app.bsky.graph.block" && r.value.subject) blockedDids.add(r.value.subject);
    else if (r.value.$type === "app.bsky.graph.follow" && r.value.subject) followDids.add(r.value.subject);
  }

  const result = {
    did, handle, profile,
    totalBlocks: blockedDids.size,
    totalFollows: followDids.size,
    lists: [],
    indexedSinceMs: CONSTELLATION_INDEXED_SINCE_MS,
  };

  if (blockedDids.size === 0) return result;

  // Discover candidate lists: every list any blocked account is a member
  // of, plus how many distinct blocked accounts landed on each one (the
  // triage signal used below).
  const hitCounts = new Map(); // list uri -> count of your blocked accounts found on it
  let scanned = 0;
  const blockedArr = Array.from(blockedDids);
  await pooledEach(blockedArr, FETCH_CONCURRENCY, async (bdid) => {
    let lists = [];
    try {
      lists = await fetchListMemberships(bdid);
    } catch {
      // one account's membership lookup failing shouldn't sink the whole scan
    }
    for (const l of new Set(lists)) hitCounts.set(l, (hitCounts.get(l) || 0) + 1);
    scanned++;
    step(`scanning list memberships for your blocks… ${scanned}/${blockedArr.length} (${hitCounts.size} candidate list${hitCounts.size === 1 ? "" : "s"} found)`);
  });

  if (hitCounts.size === 0) return result;

  let candidateUris = Array.from(hitCounts.keys());
  result.candidatesFound = candidateUris.length;
  if (candidateUris.length > MAX_CANDIDATES) {
    candidateUris.sort((a, b) => hitCounts.get(b) - hitCounts.get(a));
    result.candidatesDropped = candidateUris.length - MAX_CANDIDATES;
    candidateUris = candidateUris.slice(0, MAX_CANDIDATES);
  }

  // Metadata pass: keep only actual moderation lists (blocklists), not
  // curation lists or starter packs a blocked account happens to be in too.
  step(`checking ${candidateUris.length} candidate list${candidateUris.length === 1 ? "" : "s"}…`);
  const modlists = [];
  await pooledEach(candidateUris, FETCH_CONCURRENCY, async (uri) => {
    let rec;
    try {
      rec = await getListRecord(uri);
    } catch {
      rec = null;
    }
    if (rec && rec.value && rec.value.purpose === "app.bsky.graph.defs#modlist") {
      modlists.push({ uri, did: rec.did, name: rec.value.name || "(unnamed list)", description: rec.value.description || "" });
    }
  });

  if (modlists.length === 0) return result;

  // Owner handles are cosmetic (the byline under each list's name) — one
  // batched lookup for every surviving list's creator, not worth a
  // dedicated pass or blocking the rest of the pipeline on it.
  try {
    const ownerHandles = await getHandles(Array.from(new Set(modlists.map((l) => l.did))));
    for (const l of modlists) l.ownerHandle = ownerHandles.get(l.did) || l.did;
  } catch {
    for (const l of modlists) l.ownerHandle = l.did;
  }

  // Full-membership pass per surviving list: exact block/follow overlap
  // counts, plus a sampled .bsky.social share.
  let done = 0;
  await pooledEach(modlists, FETCH_CONCURRENCY, async (list) => {
    let memberDids = [];
    try {
      memberDids = await fetchListMembers(list.uri);
    } catch {
      memberDids = [];
    }
    const memberSet = new Set(memberDids);
    list.memberCount = memberSet.size;
    let blocksInList = 0;
    for (const d of blockedDids) if (memberSet.has(d)) blocksInList++;
    let followsInList = 0;
    for (const d of followDids) if (memberSet.has(d)) followsInList++;
    list.blocksInList = blocksInList;
    list.followsInList = followsInList;

    const sample = memberDids.slice(0, SHARE_SAMPLE_SIZE);
    list.sampled = memberDids.length > sample.length;
    list.sampleSize = sample.length;
    if (sample.length) {
      let handles;
      try {
        handles = await getHandles(sample);
      } catch {
        handles = new Map();
      }
      let bskySocial = 0;
      for (const h of handles.values()) if (/\.bsky\.social$/i.test(h)) bskySocial++;
      list.shareResolved = handles.size;
      list.shareBskySocial = bskySocial;
    } else {
      list.shareResolved = 0;
      list.shareBskySocial = 0;
    }

    list.webUrl = listWebUrl(list.uri);
    done++;
    step(`reading full membership… ${done}/${modlists.length} lists`);
  });

  // Rank: most of your blocks first, fewest of your follows breaking ties.
  modlists.sort((a, b) => (b.blocksInList - a.blocksInList) || (a.followsInList - b.followsInList) || (b.memberCount - a.memberCount));

  result.lists = modlists.filter((l) => l.blocksInList > 0);
  return result;
}
