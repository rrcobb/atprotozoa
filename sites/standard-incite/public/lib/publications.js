// publications.js — for a pool of mutuals, find who has a standard.site
// publication (site.standard.publication record on their own PDS) and how
// long it's been since their last site.standard.document. standard.site is
// the shared publishing lexicon Leaflet, pckt.blog and Offprint all speak —
// see sites/commonplace, the composer this site's collections are borrowed
// from readonly. A site.standard.document record's `site` field is the
// AT-URI of the publication it was posted to (see commonplace's publish
// step), which is how "last post" gets attributed to the right publication
// when a mutual runs more than one.

import { resolvePds, listRecords, pooledEach } from "./atproto.js";

const PUB_COLLECTION = "site.standard.publication";
const DOC_COLLECTION = "site.standard.document";
// Self-declared "don't show me here" — see public/lexicons/net.bisks.standard-incite.optout.json
// and public/lib/oauth.js. Written only by the account itself (subject must
// equal the record's own repo DID), so this checked-but-never-written-here
// collection is the mechanism for that guarantee, not a promise this file
// enforces on its own.
const OPTOUT_COLLECTION = "net.bisks.standard-incite.optout";

// Politeness/browser-memory limit on how many mutuals' PDSes get hit at once
// — not a cap on how many mutuals get checked (pooledEach still runs every
// one). Same number and reasoning as sites/mootrace/public/lib/race.js and
// sites/listrank/public/lib/rank.js: gentle on a browser's connection pool
// when fanning out to dozens of different PDS hosts at once.
const CONCURRENCY = 6;

// Checks one mutual for a standard.site presence. Returns null if they have
// no PDS reachable, have opted themselves out (net.bisks.standard-incite.optout
// on their own repo), no publications at all, or publications that have never
// had a single document posted to them (nothing to incite — see the site's
// footer note). When they do have at least one publication with a real
// post, returns:
//   { publications: [{name,url,lastPublishedAt}], lastPublishedAt }
// `publications` only includes ones that have actually published something,
// each with its OWN last-post date. The top-level `lastPublishedAt` is the
// most recent of those, across all of the mutual's publications — used for
// overall freshness sorting/filtering, not shown as a single per-pub fact.
async function checkOne(mutual) {
  const pdsUrl = await resolvePds(mutual.did);
  if (!pdsUrl) return null;

  try {
    const optOut = await listRecords(pdsUrl, mutual.did, OPTOUT_COLLECTION);
    if (optOut.some((r) => r.value?.subject === mutual.did)) return null;
  } catch {
    // No opt-out collection (or unreachable) reads the same as "not opted
    // out" — this is the common case for every account that never wrote one.
  }

  let pubRecords;
  try {
    pubRecords = await listRecords(pdsUrl, mutual.did, PUB_COLLECTION);
  } catch {
    return null;
  }
  if (!pubRecords.length) return null;

  let docRecords = [];
  try {
    docRecords = await listRecords(pdsUrl, mutual.did, DOC_COLLECTION);
  } catch {
    // couldn't read their documents — treat every publication as never
    // having posted rather than guessing; they'll be dropped below
  }

  const lastByPubUri = new Map();
  for (const d of docRecords) {
    const site = d.value?.site;
    const publishedAt = d.value?.publishedAt;
    if (!site || !publishedAt) continue;
    const t = new Date(publishedAt).getTime();
    if (Number.isNaN(t)) continue;
    const prev = lastByPubUri.get(site);
    if (!prev || t > new Date(prev).getTime()) lastByPubUri.set(site, publishedAt);
  }

  const publications = pubRecords
    .map((r) => ({
      name: r.value?.name || "(untitled publication)",
      url: r.value?.url || "",
      lastPublishedAt: lastByPubUri.get(r.uri) || null,
    }))
    .filter((p) => p.lastPublishedAt);

  if (!publications.length) return null;

  const lastPublishedAt = publications.reduce(
    (max, p) => (!max || new Date(p.lastPublishedAt) > new Date(max) ? p.lastPublishedAt : max),
    null,
  );

  return { publications, lastPublishedAt };
}

// Scans every mutual for a standard.site presence, in bounded-concurrency
// parallel. `onProgress(done, total)` fires after each mutual finishes.
// Returns every mutual who has at least one publication with a real post on
// it, tagged with `publications` and `lastPublishedAt` — filtering to
// "stale" (> 1 month) is the caller's job, since the UI also wants to show
// fresh publishers.
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
