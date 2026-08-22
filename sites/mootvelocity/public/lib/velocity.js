// velocity.js — combine a profile (followersCount, createdAt) with a
// scanActiveStreak() result into the numbers this site is actually about:
// followers per month of *real* active time, not raw account age.

const DAY_MS = 86400000;
const MONTH_DAYS = 30.44;

// profile: from app.bsky.actor.getProfiles (has followersCount, createdAt)
// scanResult: from scan.js scanActiveStreak()
export function computeVelocity(profile, scanResult, now) {
  const createdAt = profile.createdAt ? new Date(profile.createdAt) : null;
  const rawAgeDays = createdAt ? Math.max(1, (now - createdAt) / DAY_MS) : null;

  const usedFallback = !scanResult || !scanResult.streakStart;
  const activeSince = usedFallback ? createdAt : scanResult.streakStart;
  const activeDays = activeSince ? Math.max(1, (now - activeSince) / DAY_MS) : null;

  const followers = profile.followersCount || 0;
  const velocityPerMonth = activeDays ? (followers / activeDays) * MONTH_DAYS : null;

  // "floor" = we stopped scanning (hit the page/time cap) without ever
  // finding a real gap, so the true streak may reach further back than we
  // saw — activeDays is a lower bound and velocity is correspondingly an
  // upper-bound estimate. "exact" = we either found the gap or scanned the
  // account's entire history.
  const confidence = usedFallback
    ? "no-posts"
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
