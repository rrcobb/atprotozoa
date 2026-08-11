// arena.js — turns two public Bluesky profiles into fantasy creatures and
// fights an HP-based arena battle between them.
//
// Same house pattern as sites/fantasyduel/public/lib/duel.js: every stat is
// derived from real public profile fields, plus seeded PRNG rolls so the
// fight isn't 100% predictable from stats alone. No Math.random() — the seed
// is a hash of both DIDs together (sorted, so it doesn't matter which input
// box a handle went in), so the exact same pairing always gets the same
// creatures and the same fight. A rematch between the same two handles
// always plays out identically.

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

function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length) % arr.length];
}

// Four stats, same shape as fantasyduel: real profile numbers, rescaled.
function statsFor(profile) {
  const followers = profile.followersCount || 0;
  const follows = profile.followsCount || 0;
  const posts = profile.postsCount || 0;
  const bio = (profile.description || "").length;

  // POW — how hard it hits, scaled off how much they post.
  const pow = clamp(Math.log2(posts + 1) * 8, 0, 100);
  // SPD — how nimbly it moves, scaled off follower/follow ratio.
  const spd = clamp((followers / (follows + 1)) * 9, 0, 100);
  // CUN — trickery and crit chance, scaled off bio flair + profile polish.
  const cun = clamp(bio / 2 + (profile.displayName ? 12 : 0) + (profile.avatar ? 8 : 0), 0, 100);
  // AURA — a protective bulk/glow, scaled off raw follower count.
  const aura = clamp(Math.log2(followers + 1) * 9, 0, 100);

  return { pow, spd, cun, aura };
}

function highestStat(stats) {
  return Object.entries(stats).sort((a, b) => b[1] - a[1])[0][0];
}

const SPECIES_BY_STAT = {
  pow: ["Dragon", "Kraken", "Chimera"],
  spd: ["Griffin", "Wyvern", "Jackalope"],
  cun: ["Sphinx", "Basilisk", "Manticore"],
  aura: ["Unicorn", "Phoenix", "Yeti"],
};

const EMOJI = {
  Dragon: "🐉", Kraken: "🐙", Chimera: "🐐",
  Griffin: "🦅", Wyvern: "🦇", Jackalope: "🐇",
  Sphinx: "🦁", Basilisk: "🐍", Manticore: "🦂",
  Unicorn: "🦄", Phoenix: "🔥", Yeti: "❄️",
};

const MOVES = {
  Dragon: ["breathes a jet of flame at", "rakes with molten claws at", "slams a spiked tail into"],
  Kraken: ["drags under with an inked tentacle", "crushes in a bone-cracking coil", "slaps with a barnacled arm"],
  Chimera: ["bites with three heads at once", "gores with curling horns", "roars until the ground shakes under"],
  Griffin: ["dive-bombs with talons out at", "rakes past at full speed against", "buffets with razor wings against"],
  Wyvern: ["lashes with a barbed tail at", "swoops in low and fast on", "snaps venom-slick jaws at"],
  Jackalope: ["headbutts with surprising force into", "zigzags in for a sharp nip at", "kicks off a rock for extra spring into"],
  Sphinx: ["poses an unanswerable riddle to", "pins down with a stone-still glare on", "swipes a scholar's claw at"],
  Basilisk: ["locks eyes and nearly petrifies", "strikes low and fast at", "hisses a paralyzing warning at"],
  Manticore: ["flings spine-darts across the arena at", "lashes a scorpion tail into", "grins with too many teeth at"],
  Unicorn: ["skewers cleanly with a spiraled horn into", "tramples with silver hooves over", "blinds with a radiant flash at"],
  Phoenix: ["dives wreathed in flame at", "scatters searing feathers over", "rises from a small blaze to strike"],
  Yeti: ["swings a boulder-sized fist at", "buries the ground in a snow slam near", "roars an avalanche warning at"],
};

const MISS_LINES = [
  (a, b) => `${b} slips out of the way — ${a} hits nothing but arena dust`,
  (a, b) => `${b} ducks clean under it, and ${a} stumbles past`,
  (a, b) => `${a} winds up big, but ${b} was already gone`,
];

// Builds a fantasy creature sheet for one profile. Deterministic per-DID,
// independent of who the opponent is.
export function buildCreature(profile) {
  const rng = mulberry32(hash32(profile.did));
  const stats = statsFor(profile);
  const dominant = highestStat(stats);
  const species = pick(rng, SPECIES_BY_STAT[dominant]);
  const maxHp = Math.round(clamp(50 + stats.aura * 0.7, 50, 140));
  const atk = Math.round(clamp(10 + stats.pow * 0.32, 10, 45));
  const critChance = clamp(0.05 + stats.cun / 400, 0.05, 0.3);
  return {
    profile,
    stats,
    dominant,
    species,
    emoji: EMOJI[species],
    moves: MOVES[species],
    maxHp,
    atk,
    speed: stats.spd,
    critChance,
  };
}

// Runs the full arena battle: creature sheets for both sides, a turn-by-turn
// log with live HP, and a winner. Deterministic per pairing (see module doc).
export function arenaBattle(profileA, profileB) {
  const pairSeed = hash32([profileA.did, profileB.did].sort().join("|"));
  const rng = mulberry32(pairSeed);

  const a = buildCreature(profileA);
  const b = buildCreature(profileB);

  const luckA = rng() * 10;
  const luckB = rng() * 10;

  let hpA = a.maxHp;
  let hpB = b.maxHp;

  const nameA = `@${a.profile.handle}`;
  const nameB = `@${b.profile.handle}`;

  // Whoever's faster (plus a small seeded nudge) swings first each round.
  const order = a.speed + luckA >= b.speed + luckB ? ["a", "b"] : ["b", "a"];

  const log = [];
  const MAX_ROUNDS = 12;
  let rounds = 0;

  outer: for (rounds = 0; rounds < MAX_ROUNDS; rounds++) {
    for (const side of order) {
      if (hpA <= 0 || hpB <= 0) break outer;
      const attacker = side === "a" ? a : b;
      const defender = side === "a" ? b : a;
      const attackerName = side === "a" ? nameA : nameB;
      const defenderName = side === "a" ? nameB : nameA;

      const hitChance = clamp(0.65 + (attacker.speed - defender.speed) / 300, 0.35, 0.95);
      const hit = rng() < hitChance;
      const move = pick(rng, attacker.moves);

      if (hit) {
        const crit = rng() < attacker.critChance;
        const dmg = Math.round(attacker.atk * (0.85 + rng() * 0.3) * (crit ? 1.6 : 1));
        if (side === "a") hpB = Math.max(0, hpB - dmg);
        else hpA = Math.max(0, hpA - dmg);
        const defenderHpNow = side === "a" ? hpB : hpA;
        const defenderMaxHp = side === "a" ? b.maxHp : a.maxHp;
        log.push({
          text: `${attacker.emoji} ${attacker.species} (${attackerName}) ${move} ${defender.emoji} ${defender.species} (${defenderName}) for ${dmg}${crit ? " — critical hit!" : ""}`,
          side,
          hp: defenderHpNow,
          maxHp: defenderMaxHp,
          defenderSide: side === "a" ? "b" : "a",
        });
      } else {
        log.push({
          text: MISS_LINES[Math.floor(rng() * MISS_LINES.length)](attackerName, defenderName),
          side,
          hp: side === "a" ? hpB : hpA,
          maxHp: side === "a" ? b.maxHp : a.maxHp,
          defenderSide: side === "a" ? "b" : "a",
        });
      }
    }
  }

  let winner;
  if (hpA <= 0 && hpB <= 0) winner = luckA >= luckB ? "a" : "b";
  else if (hpA <= 0) winner = "b";
  else if (hpB <= 0) winner = "a";
  else winner = hpA / a.maxHp === hpB / b.maxHp ? (luckA >= luckB ? "a" : "b") : hpA / a.maxHp > hpB / b.maxHp ? "a" : "b";

  return {
    a: { ...a, hp: hpA },
    b: { ...b, hp: hpB },
    log,
    winner,
    rounds: rounds + 1,
  };
}
