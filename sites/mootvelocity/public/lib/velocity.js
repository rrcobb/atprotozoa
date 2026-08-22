// velocity.js — combine a profile (followersCount, createdAt) with a
// scanActiveStreak() result into the numbers this site is actually about:
// followers per month of *real* active time, not raw account age.

import { GAP_DAYS } from "./scan.js";

const DAY_MS = 86400000;
const MONTH_DAYS = 30.44;

// profile: from app.bsky.actor.getProfiles (has followersCount, createdAt)
// scanResult: from scan.js scanActiveStreak()
export function computeVelocity(profile, scanResult, now) {
  const createdAt = profile.createdAt ? new Date(profile.createdAt) : null;
  const rawAgeDays = createdAt ? Math.max(1, (now - createdAt) / DAY_MS) : null;

  const noPosts = !scanResult || !scanResult.streakStart;

  // A capped scan (no gap found, history not exhausted) only tells us
  // *something*: for very high-frequency posters, the page/post cap can be
  // hit within days of calendar time — e.g. someone posting 100+ times a day
  // blows through 2,000 posts in under two weeks. That's not evidence of a
  // short active streak, it's just "we ran out of scan budget before we
  // could even test for one real gap" (GAP_DAYS itself). Extrapolating
  // lifetime followers over that tiny window produces nonsense (spot-checked
  // 2026-08-22: an account with ~10.6k total followers came out to ~30k/mo).
  // Treat any capped scan that hasn't even covered one GAP_DAYS window as
  // unreliable and fall back to account age, same as a no-posts account.
  const cappedTooSoon =
    !noPosts &&
    !scanResult.gapFound &&
    !scanResult.exhausted &&
    (now - scanResult.streakStart) / DAY_MS < GAP_DAYS;

  const usedFallback = noPosts || cappedTooSoon;
  const activeSince = usedFallback ? createdAt : scanResult.streakStart;
  const activeDays = activeSince ? Math.max(1, (now - activeSince) / DAY_MS) : null;

  const followers = profile.followersCount || 0;
  const velocityPerMonth = activeDays ? (followers / activeDays) * MONTH_DAYS : null;

  // "floor" = we stopped scanning (hit the page/time cap) without ever
  // finding a real gap, but we did cover at least one GAP_DAYS window, so
  // activeDays is a genuine lower bound and velocity is correspondingly an
  // upper-bound estimate. "unreliable" = the cap hit before we could even
  // test for one real gap (see cappedTooSoon above) — using account age
  // instead, since the scanned window is too dense to mean anything.
  // "exact" = we either found the gap or scanned the account's entire
  // history. "no-posts" = no original posts found at all.
  const confidence = noPosts
    ? "no-posts"
    : cappedTooSoon
      ? "unreliable"
      : scanResult.gapFound || scanResult.exhausted
        ? "exact"
        : "floor";

  return {
    did: profile.did,
    handle: profile.handle,
    displayName: profile.displayName || profile.handle,
    avatar: profile.avatar || "",
    followers,
    createdAt,
    rawAgeDays,
    activeSince,
    activeDays,
    trimmedDays: rawAgeDays != null && activeDays != null ? Math.max(0, rawAgeDays - activeDays) : null,
    velocityPerMonth,
    confidence,
    postsSeen: scanResult ? scanResult.postsSeen : 0,
  };
}

export function fmtDuration(days) {
  if (days == null) return "—";
  if (days < 60) return Math.round(days) + "d";
  const months = days / MONTH_DAYS;
  if (months < 24) return Math.round(months) + "mo";
  return (months / 12).toFixed(1) + "y";
}

export function fmtDate(d) {
  if (!d) return "—";
  return d.toISOString().slice(0, 10);
}

export function fmtNum(n) {
  return Number(n || 0).toLocaleString();
}
