// norvid.js — the daily USD value of 1 NORVID.
//
// shimmermathlabs.com's ask: "1 norvid is currently $291.81, using your own
// xbill. recompute conversion factor daily." xbill (sites/xbill) prices
// downloading a whole bsky repo at X's read-API rate card ($5/1000 posts,
// $10/1000 profiles fetched) instead of bsky's actual cost of zero. The
// norvid unit is pegged to that same meter run against the repo the unit is
// named for — @norvid-studies.bsky.social — so 1 NORVID is literally what it
// would cost to archive Norvid off bsky the X way.
//
// "Recompute daily" means once per UTC day, not once per page load: a live
// recompute downloads NORVID's entire repo CAR (see car.js), which is real
// bytes over the wire. The result is cached in localStorage keyed by date;
// getNorvidRate() only does the live walk when today's entry is missing.
//
// Copy, don't abstract: this is xbill.js's runMeter, trimmed to the one
// account and one number this site needs — see sites/xbill/public/lib/xbill.js
// for the full live-meter version with EXTRA/META modes.

import { fetchRepoRecordsWithKeys } from "./car.js";
import { resolvePds } from "./identity.js";

export const NORVID_HANDLE = "norvid-studies.bsky.social";
export const PRICE_PER_1000_POSTS = 5;
export const PRICE_PER_1000_PROFILES = 10;
// shimmermathlabs.com's own figure from the ask itself — used only if a live
// computation fails AND there's no cached value from any previous day to
// fall back on (private browsing, first-ever load with the network down).
export const FALLBACK_USD = 291.81;

const PUB = "https://public.api.bsky.app/xrpc";
const CACHE_KEY = "norvidrate.norvid.v1";

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

async function jget(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

// Whatever's in localStorage, regardless of how stale — the caller decides
// whether "today" is required or a previous day's number is good enough to
// show while a fresh one is computed in the background.
export function peekNorvidCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.usdPerNorvid !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function isFreshToday(cached) {
  return !!cached && cached.date === todayKey();
}

function writeCache(data) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
  } catch {
    // localStorage unavailable — fine, just recomputes next load too
  }
}

// The live walk: resolve norvid-studies -> PDS -> download + tally their
// repo CAR, price it at xbill's rate card. `onStatus(text)` fires as the
// walk progresses so a caller can show it isn't just hanging.
export async function computeNorvidRate(onStatus) {
  const say = onStatus || (() => {});

  say(`resolving @${NORVID_HANDLE}…`);
  const idRes = await jget(`${PUB}/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(NORVID_HANDLE)}`);
  const did = idRes.did;
  if (!did) throw new Error("couldn't resolve norvid-studies.bsky.social");

  say("locating norvid-studies' PDS…");
  const pds = await resolvePds(did);
  if (!pds) throw new Error("couldn't find norvid-studies' PDS");

  say("downloading norvid-studies' repo…");
  const { records } = await fetchRepoRecordsWithKeys(pds, did, "app.bsky.feed.post", (count) => {
    say(`walking repo… ${count.toLocaleString()} posts counted so far`);
  });
  const postsFetched = records.length;
  const profilesFetched = 1; // the one profile lookup a real archive job needs to attribute it to norvid

  const usdPerNorvid =
    (postsFetched / 1000) * PRICE_PER_1000_POSTS + (profilesFetched / 1000) * PRICE_PER_1000_PROFILES;

  return { usdPerNorvid, postsFetched, profilesFetched, date: todayKey(), computedAt: Date.now() };
}

// Today's rate: cached if today's entry already exists, otherwise a fresh
// live computation (cached for the rest of the day once it succeeds). Falls
// back to yesterday's (or any prior day's) cached number if the live walk
// fails, and to FALLBACK_USD only if there's no cache at all.
export async function getNorvidRate(onStatus) {
  const cached = peekNorvidCache();
  if (isFreshToday(cached)) {
    return { ...cached, stale: false, fallback: false, live: false };
  }
  try {
    return await forceRefreshNorvidRate(onStatus);
  } catch (err) {
    if (cached) {
      return { ...cached, stale: true, fallback: false, live: false, error: String((err && err.message) || err) };
    }
    return {
      usdPerNorvid: FALLBACK_USD,
      postsFetched: null,
      profilesFetched: null,
      date: todayKey(),
      computedAt: null,
      stale: false,
      fallback: true,
      live: false,
      error: String((err && err.message) || err),
    };
  }
}

// Bypasses the once-a-day cache check entirely — used by an explicit
// "refresh" click, where redoing the live repo walk mid-day is exactly what
// was asked for.
export async function forceRefreshNorvidRate(onStatus) {
  const fresh = await computeNorvidRate(onStatus);
  writeCache(fresh);
  return { ...fresh, stale: false, fallback: false, live: true };
}
