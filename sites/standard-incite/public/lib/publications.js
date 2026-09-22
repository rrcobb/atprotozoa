// publications.js — for a pool of mutuals, find who has a standard.site
// publication (site.standard.publication record on their own PDS) and how
// long it's been since their last site.standard.document. standard.site is
// the shared publishing lexicon Leaflet, pckt.blog and Offprint all speak —
// see sites/commonplace, the composer this site's collections are borrowed
// from readonly.

import { resolvePds, listRecords, pooledEach } from "./atproto.js";

const PUB_COLLECTION = "site.standard.publication";
const DOC_COLLECTION = "site.standard.document";

// Politeness/browser-memory limit on how many mutuals' PDSes get hit at once
// — not a cap on how many mutuals get checked (pooledEach still runs every
// one). Same number and reasoning as sites/mootrace/public/lib/race.js and
// sites/listrank/public/lib/rank.js: gentle on a browser's connection pool
// when fanning out to dozens of different PDS hosts at once.
const CONCURRENCY = 6;

// Checks one mutual for a standard.site presence. Returns null if they have
// no PDS reachable or no publications at all (nothing to report on). When
// they do have publications, returns:
//   { publications: [{name,url}], lastPublishedAt: ISOstring|null }
// `lastPublishedAt` is null when they have publications but have never
// actually published a document to any of them.
async function checkOne(mutual) {
  const pdsUrl = await resolvePds(mutual.did);
  if (!pdsUrl) return null;

  let pubRecords;
  try {
    pubRecords = await listRecords(pdsUrl, mutual.did, PUB_COLLECTION);
  } catch {
    return null;
  }
  if (!pubRecords.length) return null;

  const publications = pubRecords.map((r) => ({
    name: r.value?.name || "(untitled publication)",
    url: r.value?.url || "",
  }));

  let lastPublishedAt = null;
  try {
    const docs = await listRecords(pdsUrl, mutual.did, DOC_COLLECTION, { latestOnly: true });
    lastPublishedAt = docs[0]?.value?.publishedAt || null;
  } catch {
    // couldn't read their documents — still report the publication(s) with
    // an unknown last-post date rather than dropping them entirely
  }

  return { publications, lastPublishedAt };
}

// Scans every mutual for a standard.site presence, in bounded-concurrency
// parallel. `onProgress(done, total)` fires after each mutual finishes.
// Returns every mutual who has at least one publication, tagged with
// `publications` and `lastPublishedAt` — filtering to "stale" (> 1 month) is
// the caller's job, since the UI also wants to show fresh publishers.
export async function scanForPublications(pool, { onProgress } = {}) {
  const found = [];
  let done = 0;
  await pooledEach(pool, CONCURRENCY, async (mutual) => {
    let result = null;
    try {
      result = await checkOne(mutual);
    } catch {
      result = null;
    }
    done++;
    if (onProgress) onProgress(done, pool.length);
    if (result) found.push({ ...mutual, ...result });
  });
  return found;
}

// A large finite placeholder for "never published" — not Infinity, so a
// sort comparator subtracting two of these (two never-published mutuals)
// gets 0, not NaN.
const NEVER_DAYS = 1e6;

export function daysSince(iso) {
  if (!iso) return NEVER_DAYS;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return NEVER_DAYS;
  return Math.floor((Date.now() - t) / 86400000);
}
