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
//
// @vikanezrimaya.xyz reported the progress bar freezing the tab on a big
// scan and asked whether this ran on a web worker. It didn't — every repo
// CAR download's DAG-CBOR/MST decode (car.js's cborValue/walk, no yield
// points) was landing on whichever thread called rankBlocklists. The two
// stages that do that decode (this account's own blocks+follows, and each
// candidate list's full membership) now dispatch into a small pool of real
// Worker threads (workerpool.js + rank-pool-worker.js) instead — off the
// calling thread entirely, and spread across more than one thread for
// genuine parallelism, not just relief. Falls back to running inline,
// single-threaded, if Worker construction fails for any reason (unsupported
// runtime, blocked by a CSP, etc.) — same result, just slower.

import { resolveHandle, pooledEach, getHandles } from "./identity.js";
import { fetchListMemberships, listWebUrl, CONSTELLATION_INDEXED_SINCE_MS } from "./constellation.js";
import { getListRecord, fetchOwnRecords, fetchListMembers, fullListStats } from "./list-io.js";
import { createWorkerPool } from "./workerpool.js";

const FETCH_CONCURRENCY = 8; // browser connection-pool courtesy, not a data cap — only used for the metadata pass below, which is plain JSON fetches with no pool worth pooling

function makePool() {
  if (typeof Worker === "undefined") return null;
  try {
    const size = Math.max(2, Math.min(6, (typeof navigator !== "undefined" && navigator.hardwareConcurrency) || 4));
    return createWorkerPool(new URL("./rank-pool-worker.js", import.meta.url), size);
  } catch {
    return null; // e.g. module workers unsupported, or blocked — inline fallback below still works
  }
}

// Runs `task` for every item via the worker pool when one exists (dispatched
// all at once — the pool's own queue bounds real concurrency to its size, so
// no separate concurrency cap is needed here), or via `fallbackFn` under a
// pooledEach concurrency cap when it doesn't. Either way `onDone` fires once
// per item as it resolves, for progress reporting.
async function poolMap(items, pool, task, toPayload, fallbackFn, onDone) {
  if (pool) {
    await Promise.all(items.map(async (item) => {
      let r;
      try {
        r = await pool.run(task, toPayload(item));
      } catch {
        try { r = await fallbackFn(item); } catch { r = null; }
      }
      if (onDone) onDone(item, r);
    }));
  } else {
    await pooledEach(items, FETCH_CONCURRENCY, async (item) => {
      let r;
      try { r = await fallbackFn(item); } catch { r = null; }
      if (onDone) onDone(item, r);
    });
  }
}

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

export async function rankBlocklists(rawHandle, { onProgress } = {}) {
  const step = (msg) => onProgress && onProgress(msg);
  const pool = makePool();

  try {
    return await runPipeline(rawHandle, step, pool);
  } finally {
    if (pool) pool.terminate();
  }
}

async function runPipeline(rawHandle, step, pool) {
  step("resolving handle…");
  const { did, handle, profile } = await resolveHandle(rawHandle);

  step(`reading @${handle}'s blocks + follows…`);
  let records;
  try {
    records = pool ? await pool.run("ownRecords", { did }) : await fetchOwnRecords(did);
  } catch {
    records = await fetchOwnRecords(did);
  }
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
  await poolMap(
    blockedArr,
    pool,
    "discover",
    (bdid) => ({ did: bdid }),
    (bdid) => fetchListMemberships(bdid).then((lists) => Array.from(new Set(lists))),
    (bdid, lists) => {
      for (const l of new Set(lists || [])) hitCounts.set(l, (hitCounts.get(l) || 0) + 1);
      scanned++;
      step(`scanning list memberships for your blocks… ${scanned}/${blockedArr.length} (${hitCounts.size} candidate list${hitCounts.size === 1 ? "" : "s"} found)`);
    }
  );

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
  // counts, plus a sampled .bsky.social share. This is the heaviest stage
  // (a repo CAR download + DAG-CBOR/MST decode per list), so it's the main
  // beneficiary of the worker pool — see this file's header.
  const followArr = Array.from(followDids);
  let done = 0;
  const fallbackFull = async (list) => {
    let memberDids = [];
    try {
      memberDids = await fetchListMembers(list.uri);
    } catch {
      memberDids = [];
    }
    return fullListStats(memberDids, blockedArr, followArr);
  };
  await poolMap(
    modlists,
    pool,
    "fullMembership",
    (list) => ({ uri: list.uri, blockedDids: blockedArr, followDids: followArr }),
    fallbackFull,
    (list, stats) => {
      Object.assign(list, stats || { memberCount: 0, blocksInList: 0, followsInList: 0, sampled: false, sampleSize: 0, shareResolved: 0, shareBskySocial: 0 });
      list.webUrl = listWebUrl(list.uri);
      done++;
      step(`reading full membership… ${done}/${modlists.length} lists`);
    }
  );

  // Rank: most of your blocks first, fewest of your follows breaking ties.
  modlists.sort((a, b) => (b.blocksInList - a.blocksInList) || (a.followsInList - b.followsInList) || (b.memberCount - a.memberCount));

  result.lists = modlists.filter((l) => l.blocksInList > 0);
  return result;
}
