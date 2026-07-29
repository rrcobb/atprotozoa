// battle.js — turns two public Bluesky profiles into a deterministic "fight."
//
// No RNG from Math.random(): every stat is derived from real public profile
// fields (followers, posts, follow ratio, bio flair), except LUCK, which is a
// seeded pseudo-random roll so the exact same pairing always resolves the
// same way (rematching doesn't change the outcome — same two fighters, same
// fight). The seed is symmetric (sorted DIDs) so it doesn't matter which
// input box either handle was typed into.
//
// One rigged exception, on purpose: buildthis.bisks.net always wins its own
// battles, stats be damned. See BUILDTHIS_DID below.

export const BUILDTHIS_DID = "did:plc:wlj4p2kazhifag6w4nanjnee";

const TE = new TextEncoder();

// djb2 over UTF-8 bytes -> uint32. Deterministic across browsers/runs.
function hash32(str) {
  let h = 5381;
  for (const b of TE.encode(str)) {
    h = ((h << 5) + h + b) >>> 0;
  }
  return h >>> 0;
}

// mulberry32: tiny deterministic PRNG from a uint32 seed.
function mulberry32(seed) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function statsFor(profile) {
  const followers = profile.followersCount || 0;
  const follows = profile.followsCount || 0;
  const posts = profile.postsCount || 0;
  const bio = (profile.description || "").length;

  const clout = clamp(Math.log2(followers + 1) * 9, 0, 100);
  const grind = clamp(Math.log2(posts + 1) * 7, 0, 100);
  const pull = clamp((followers / (follows + 1)) * 10, 0, 100);
  const charisma = clamp(
    bio / 2 + (profile.displayName ? 12 : 0) + (profile.avatar ? 8 : 0),
    0,
    100,
  );

  return { clout, grind, pull, charisma };
}

// Fight two profiles. Returns { a, b, winner, rigged, margin } where `a`/`b`
// each carry { profile, stats: {clout,grind,pull,charisma,luck}, power }.
export function fight(profileA, profileB) {
  const pairSeed = hash32([profileA.did, profileB.did].sort().join("|"));
  const rngA = mulberry32(pairSeed ^ hash32(profileA.did));
  const rngB = mulberry32(pairSeed ^ hash32(profileB.did));

  const sA = statsFor(profileA);
  const sB = statsFor(profileB);
  const luckA = Math.round(rngA() * 100);
  const luckB = Math.round(rngB() * 100);

  const WEIGHTS = { clout: 0.35, grind: 0.15, pull: 0.25, charisma: 0.1, luck: 0.15 };
  const powerOf = (s, luck) =>
    s.clout * WEIGHTS.clout +
    s.grind * WEIGHTS.grind +
    s.pull * WEIGHTS.pull +
    s.charisma * WEIGHTS.charisma +
    luck * WEIGHTS.luck;

  const a = { profile: profileA, stats: { ...sA, luck: luckA }, power: powerOf(sA, luckA) };
  const b = { profile: profileB, stats: { ...sB, luck: luckB }, power: powerOf(sB, luckB) };

  const aIsBuildthis = profileA.did === BUILDTHIS_DID;
  const bIsBuildthis = profileB.did === BUILDTHIS_DID;
  const rigged = aIsBuildthis || bIsBuildthis;

  let winner;
  if (rigged) {
    winner = aIsBuildthis ? "a" : "b";
  } else {
    winner = a.power === b.power ? (a.stats.luck >= b.stats.luck ? "a" : "b") : a.power > b.power ? "a" : "b";
  }

  return { a, b, winner, rigged, margin: Math.abs(a.power - b.power) };
}
