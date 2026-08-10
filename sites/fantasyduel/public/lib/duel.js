// duel.js — turns two public Bluesky profiles into fantasy characters and
// narrates a made-up battle between them.
//
// Same house pattern as sites/botbattle/public/lib/battle.js: every stat is
// derived from real public profile fields, plus one seeded PRNG roll so the
// numbers aren't 100% predictable. No Math.random() — the seed is a hash of
// both DIDs together (sorted, so it doesn't matter which input box a handle
// went in), so the exact same pairing always gets the same character sheets,
// the same battle log, and the same winner. Rematching a pairing doesn't
// change the outcome; it's a fight, not a coin flip.

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

const RACES = [
  "Kobold", "Wood Elf", "Deep Dwarf", "Sprite", "Wyrmling", "Golem",
  "Moth-Kin", "Bog Witch", "Star Gnome", "Tide Orc", "Ashen Halfling",
  "Cloud Giant", "Crow-Touched", "Feral Treant", "Salt Mermaid", "Void Rabbit",
];

const CLASS_BY_STAT = {
  str: ["Berserker", "Warlord", "Pit Fighter", "Doomknight"],
  agi: ["Scout", "Windrunner", "Shadow Duelist", "Skyfeather Ranger"],
  int: ["Hedge Wizard", "Loremonger", "Bard of the Feed", "Curse Weaver"],
  aur: ["Paladin", "Sunward Guardian", "Reliquary Knight", "Aura Warden"],
};

const WEAPONS = [
  "a rusted follow-button mace", "a quill dipped in ratio ink",
  "twin blades of unread notifications", "a shield stamped with a blue check",
  "a warhammer forged from cold takes", "a bow strung with dead threads",
  "a staff topped with a glowing avatar", "a dagger honed on old subtweets",
  "a lantern that burns on engagement", "a banner stitched from screenshots",
];

const TITLES = [
  "the Unmuted", "the Ratio'd", "Keeper of the Timeline", "the Doomscroller",
  "Breaker of Threads", "the Reply-Guyed", "of the Endless Feed",
  "the Quote-Tweeted", "Warden of the Blocklist", "the Never-Logged-Off",
];

function statsFor(profile) {
  const followers = profile.followersCount || 0;
  const follows = profile.followsCount || 0;
  const posts = profile.postsCount || 0;
  const bio = (profile.description || "").length;

  // Tweet Strength — how hard they hit, scaled off how much they post.
  const str = clamp(Math.log2(posts + 1) * 8, 0, 100);
  // Follower Agility — how nimbly they're sought out, scaled off the
  // follower/follow ratio (a lot of people chasing one account = quick feet).
  const agi = clamp((followers / (follows + 1)) * 9, 0, 100);
  // Bio Cunning — wit and trickery, scaled off bio flair + profile polish.
  const int = clamp(bio / 2 + (profile.displayName ? 12 : 0) + (profile.avatar ? 8 : 0), 0, 100);
  // Clout Aura — a protective shimmer of renown, scaled off raw follower count.
  const aur = clamp(Math.log2(followers + 1) * 9, 0, 100);

  return { str, agi, int, aur };
}

function highestStat(stats) {
  return Object.entries(stats).sort((a, b) => b[1] - a[1])[0][0];
}

// Builds the fantasy character sheet for one profile. Deterministic per-DID,
// independent of who the opponent is (so a character looks the same no
// matter who they're matched against).
export function buildCharacter(profile) {
  const rng = mulberry32(hash32(profile.did));
  const stats = statsFor(profile);
  const dominant = highestStat(stats);
  const cls = pick(rng, CLASS_BY_STAT[dominant]);
  const race = pick(rng, RACES);
  const weapon = pick(rng, WEAPONS);
  const title = pick(rng, TITLES);
  return { profile, stats, dominant, class: cls, race, weapon, title };
}

const ROUND_VERBS_HIT = [
  (a, b) => `${a} lands a blow on ${b} with ${"{weapon}"}`,
  (a, b) => `${a} catches ${b} off guard`,
  (a, b) => `${a} presses the advantage against ${b}`,
];
const ROUND_VERBS_MISS = [
  (a, b) => `${b} dodges ${a}'s swing entirely`,
  (a, b) => `${b} parries and shoves ${a} back`,
  (a, b) => `${a} whiffs — ${b} wasn't even looking`,
];

function roundLine(rng, attackerName, defenderName, attackerWeapon, hit) {
  const templates = hit ? ROUND_VERBS_HIT : ROUND_VERBS_MISS;
  const line = pick(rng, templates)(attackerName, defenderName);
  return line.replace("{weapon}", attackerWeapon);
}

// Runs the full duel: character sheets for both sides, a round-by-round
// narrated log, and a winner. Deterministic per pairing (see module doc).
export function duel(profileA, profileB) {
  const pairSeed = hash32([profileA.did, profileB.did].sort().join("|"));
  const rng = mulberry32(pairSeed);

  const a = buildCharacter(profileA);
  const b = buildCharacter(profileB);

  const luckA = Math.round(rng() * 100);
  const luckB = Math.round(rng() * 100);

  const WEIGHTS = { str: 0.3, agi: 0.25, int: 0.2, aur: 0.1, luck: 0.15 };
  const powerOf = (s, luck) =>
    s.str * WEIGHTS.str + s.agi * WEIGHTS.agi + s.int * WEIGHTS.int + s.aur * WEIGHTS.aur + luck * WEIGHTS.luck;

  const powerA = powerOf(a.stats, luckA);
  const powerB = powerOf(b.stats, luckB);

  const nameA = `@${a.profile.handle}`;
  const nameB = `@${b.profile.handle}`;

  // Five narrated rounds. Each round's "hit" is a weighted coin flip off the
  // two total powers, seeded off the same pair RNG stream so the whole log
  // is reproducible for this exact matchup.
  const log = [];
  const total = powerA + powerB || 1;
  for (let i = 0; i < 5; i++) {
    const roll = rng();
    const aActs = i % 2 === 0;
    const attacker = aActs ? a : b;
    const defender = aActs ? b : a;
    const attackerName = aActs ? nameA : nameB;
    const defenderName = aActs ? nameB : nameA;
    const hitChance = aActs ? powerA / total : powerB / total;
    const hit = roll < hitChance;
    log.push(roundLine(rng, attackerName, defenderName, attacker.weapon, hit));
  }

  const winner = powerA === powerB ? (luckA >= luckB ? "a" : "b") : powerA > powerB ? "a" : "b";
  const margin = Math.abs(powerA - powerB);

  return {
    a: { ...a, luck: luckA, power: powerA },
    b: { ...b, luck: luckB, power: powerB },
    log,
    winner,
    margin,
  };
}
