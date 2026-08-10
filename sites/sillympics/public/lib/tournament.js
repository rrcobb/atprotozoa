// tournament.js — runs a five-event "Sillympics" between two public Bluesky
// profiles: virtual pizza eating, digital badge collecting, a reply-chain
// relay, a profile pageant, and a doomscroll marathon. Every event's score is
// derived from a real public profile field, plus one seeded jitter roll per
// event so results aren't perfectly predictable from the raw numbers.
//
// Same house pattern as sites/fantasyduel/public/lib/duel.js: no
// Math.random() anywhere. Each profile's per-event jitter is seeded off its
// own DID + the event key, independent of the other profile or which input
// box it went in — so a rerun of the exact same pairing (in either order)
// always produces the exact same five events, the same scores, and the same
// champion. Rerunning a pairing is a replay, not a reroll.

const TE = new TextEncoder();

function hash32(str) {
  let h = 5381;
  for (const b of TE.encode(str)) {
    h = ((h << 5) + h + b) >>> 0;
  }
  return h >>> 0;
}

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

function pairSeed(profileA, profileB) {
  return [profileA.did, profileB.did].sort().join("|");
}

// Each profile's jitter is seeded off its own DID + the event key — not the
// pair — so a profile's score in an event never depends on which input box
// it went in or who the opponent is.
function profileEventRng(profile, key) {
  return mulberry32(hash32(profile.did + "::" + key));
}

// Only used to break an exact score tie within one event; seeded off the
// pair (order-independent, since it's sorted) plus the event key.
function tieRng(profileA, profileB, key) {
  return mulberry32(hash32(pairSeed(profileA, profileB) + "::" + key + "::tie"));
}

// Each event scores both profiles off one real public field, plus a small
// seeded jitter so the loser isn't purely a function of raw follower count.
// `score` returns a whole-number tally in the event's own unit.
export const EVENTS = [
  {
    key: "pizza",
    icon: "🍕",
    name: "Virtual Pizza Eating Contest",
    unit: "slices",
    blurb: "scored off post count — prolific posters have the appetite",
    score(profile, rng) {
      const posts = profile.postsCount || 0;
      const base = Math.log2(posts + 1) * 11;
      return Math.max(1, Math.round(base + rng() * 24));
    },
    line(w, wScore, l, lScore) {
      return `${w} inhales ${wScore} slices of virtual pizza to ${l}'s ${lScore} and takes the belt.`;
    },
  },
  {
    key: "badges",
    icon: "🎖️",
    name: "Digital Badge Scavenger Hunt",
    unit: "badges",
    blurb: "scored off accounts followed — every follow is a badge collected",
    score(profile, rng) {
      const follows = profile.followsCount || 0;
      const base = Math.log2(follows + 1) * 9;
      return Math.max(1, Math.round(base + rng() * 18));
    },
    line(w, wScore, l, lScore) {
      return `${w} scavenges ${wScore} digital badges to ${l}'s ${lScore} and sweeps the board.`;
    },
  },
  {
    key: "relay",
    icon: "🏃",
    name: "Reply-Chain Relay Race",
    unit: "handoffs",
    blurb: "scored off the follower/follows ratio — a nimble baton pass",
    score(profile, rng) {
      const followers = profile.followersCount || 0;
      const follows = profile.followsCount || 0;
      const base = (followers / (follows + 1)) * 7;
      return Math.max(1, Math.round(clamp(base, 0, 220) + rng() * 20));
    },
    line(w, wScore, l, lScore) {
      return `${w} clocks ${wScore} clean handoffs down the reply chain to ${l}'s ${lScore} and breaks the tape first.`;
    },
  },
  {
    key: "pageant",
    icon: "💅",
    name: "Profile Polish Pageant",
    unit: "points",
    blurb: "scored off bio flair, display name, and avatar — judged on presentation",
    score(profile, rng) {
      const bio = (profile.description || "").length;
      const base = bio / 2 + (profile.displayName ? 14 : 0) + (profile.avatar ? 11 : 0);
      return Math.max(1, Math.round(base + rng() * 15));
    },
    line(w, wScore, l, lScore) {
      return `${w} struts away with ${wScore} judges' points to ${l}'s ${lScore} and wins the sash.`;
    },
  },
  {
    key: "marathon",
    icon: "🛋️",
    name: "Doomscroll Endurance Marathon",
    unit: "hours",
    blurb: "scored off follower count — a crowd that big takes stamina to hold",
    score(profile, rng) {
      const followers = profile.followersCount || 0;
      const base = Math.log2(followers + 1) * 6.5;
      return Math.max(1, Math.round(base + rng() * 14));
    },
    line(w, wScore, l, lScore) {
      return `${w} outlasts everyone at ${wScore} hours scrolled to ${l}'s ${lScore} and collapses across the finish line, victorious.`;
    },
  },
];

// Runs all five events for one pairing. Deterministic per pairing (see module
// doc) — same two handles always produce the same games.
export function runGames(profileA, profileB) {
  const nameA = `@${profileA.handle}`;
  const nameB = `@${profileB.handle}`;

  let winsA = 0;
  let winsB = 0;

  const results = EVENTS.map((event) => {
    const scoreA = event.score(profileA, profileEventRng(profileA, event.key));
    const scoreB = event.score(profileB, profileEventRng(profileB, event.key));
    const aWins = scoreA === scoreB ? tieRng(profileA, profileB, event.key)() >= 0.5 : scoreA > scoreB;
    if (aWins) winsA++;
    else winsB++;

    const winnerName = aWins ? nameA : nameB;
    const loserName = aWins ? nameB : nameA;
    const winnerScore = aWins ? scoreA : scoreB;
    const loserScore = aWins ? scoreB : scoreA;

    return {
      event,
      scoreA,
      scoreB,
      winner: aWins ? "a" : "b",
      line: event.line(winnerName, winnerScore, loserName, loserScore),
    };
  });

  const champion = winsA === winsB ? null : winsA > winsB ? "a" : "b";

  return { results, winsA, winsB, champion };
}
