// clash.js — turns two public Bluesky profiles into spellcasters and fights
// a real turn-based HP battle between them, element-typed rock-paper-scissors
// style (a genuinely different mechanic from sites/fantasyduel's fixed
// 5-round narrated coinflip: here damage actually depletes HP, round count
// varies by matchup, and an elemental type triangle can swing a fight).
//
// Every stat is derived from real public profile fields — tweet FREQUENCY
// (posts per day since account creation, not raw post count) drives attack
// power, which is the one thing this tick's brief called out specifically.
//
// Determinism gotcha (see sites/sillympics' sidenote entry on this exact
// bug class): don't seed one shared RNG stream that two profiles draw from
// in call-argument order — "sorted pair" only fixes the seed, not which
// argument consumes which draw, so swapping input boxes A/B would silently
// swap whose rolls are whose. Fixed here by giving EACH profile its own RNG
// stream, seeded off (that profile's own DID + the sorted pair key), so a
// profile's rolls belong to its identity, not its argument position.

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

// Four elements in a fixed beats-cycle: FIRE > STORM > TIDE > STONE > FIRE.
// Each stat maps to exactly one element, so "dominant stat" always picks
// exactly one clean element rather than needing a bigger wheel.
const BEATS = { fire: "storm", storm: "tide", tide: "stone", stone: "fire" };
const ELEMENT_GLYPH = { fire: "\u{1F525}", storm: "⚡", tide: "\u{1F30A}", stone: "\u{1FAA8}" };
const ELEMENT_LABEL = { fire: "Fire", storm: "Storm", tide: "Tide", stone: "Stone" };

const STAT_ELEMENT = { surge: "fire", focus: "storm", reach: "tide", ward: "stone" };

const SPELL_BANK = {
  fire: {
    adj: ["Ashfall", "Cinderborn", "Blazing", "Smolder-Touched", "Pyroclast"],
    noun: ["Barrage", "Firestorm", "Ember Lance", "Pyre Wave", "Scorch Burst"],
  },
  storm: {
    adj: ["Gale-Struck", "Thundershot", "Static-Veined", "Squall-Born", "Fulgent"],
    noun: ["Fracture", "Voltage Arc", "Cyclone Cut", "Charged Pulse", "Storm Lash"],
  },
  tide: {
    adj: ["Undertow", "Brineborn", "Rip-Current", "Deepwell", "Tidal"],
    noun: ["Surge", "Riptide Slash", "Wave Break", "Drowning Pull", "Flood Cast"],
  },
  stone: {
    adj: ["Bedrock", "Granite-Fisted", "Fault-Line", "Cairn-Sworn", "Landbound"],
    noun: ["Crush", "Landslide", "Quake Step", "Rubble Toss", "Stoneshear"],
  },
};

const TITLES = [
  "the Unmuted", "the Ratio'd", "Keeper of the Timeline", "the Doomscroller",
  "Breaker of Threads", "the Reply-Guyed", "of the Endless Feed",
  "the Quote-Tweeted", "Warden of the Blocklist", "the Never-Logged-Off",
];

function postsPerDay(profile) {
  const posts = profile.postsCount || 0;
  const created = profile.createdAt ? Date.parse(profile.createdAt) : NaN;
  const ageDays = Number.isFinite(created) ? Math.max(1, (Date.now() - created) / 86400000) : 365;
  return posts / ageDays;
}

function statsFor(profile) {
  const followers = profile.followersCount || 0;
  const follows = profile.followsCount || 0;
  const bio = (profile.description || "").length;

  // Surge — attack power, scaled off tweet FREQUENCY (posts/day since the
  // account was created), not raw post count. A young account that posts
  // constantly hits just as hard as an old account with a big total.
  const surge = clamp(Math.log2(postsPerDay(profile) * 30 + 1) * 22, 5, 100);
  // Focus — crit chance and who reacts first, scaled off bio flair/polish.
  const focus = clamp(bio / 2 + (profile.displayName ? 12 : 0) + (profile.avatar ? 8 : 0), 0, 100);
  // Reach — max HP pool, scaled off raw follower count.
  const reach = clamp(Math.log2(followers + 1) * 11, 10, 100);
  // Ward — damage reduction, scaled off follower/follow ratio (a lot of
  // people watching one account without it watching back = a hard shell).
  const ward = clamp((followers / (follows + 1)) * 5, 0, 45);

  return { surge, focus, reach, ward };
}

function dominantStat(stats) {
  return Object.entries(stats).sort((a, b) => b[1] - a[1])[0][0];
}

// Builds the spellcaster sheet for one profile: element, HP pool, and a
// signature spell. Deterministic per-DID, independent of the opponent.
export function buildCaster(profile) {
  const rng = mulberry32(hash32(profile.did));
  const stats = statsFor(profile);
  const element = STAT_ELEMENT[dominantStat(stats)];
  const bank = SPELL_BANK[element];
  const spell = `${pick(rng, bank.adj)} ${pick(rng, bank.noun)}`;
  const title = pick(rng, TITLES);
  const maxHp = Math.round(70 + stats.reach * 0.9);
  return { profile, stats, element, spell, title, maxHp };
}

function typeMultiplier(attackerEl, defenderEl) {
  if (attackerEl === defenderEl) return 1;
  if (BEATS[attackerEl] === defenderEl) return 1.35;
  if (BEATS[defenderEl] === attackerEl) return 0.7;
  return 1; // the two elements aren't adjacent on the cycle
}

const ROUND_CAP = 10;

// Runs the full clash: caster sheets for both sides, a turn-by-turn HP log,
// and a winner. Each caster's rolls come from ITS OWN rng stream (own DID +
// the sorted pair key) — see module doc — so swapping which handle goes in
// input box A vs B never changes the outcome, only which side displays it.
export function clash(profileA, profileB) {
  const pairKey = [profileA.did, profileB.did].sort().join("|");
  const rngA = mulberry32(hash32(profileA.did + "::" + pairKey));
  const rngB = mulberry32(hash32(profileB.did + "::" + pairKey));

  const a = buildCaster(profileA);
  const b = buildCaster(profileB);

  const matchup = typeMultiplier(a.element, b.element);
  const matchupInv = typeMultiplier(b.element, a.element);

  const nameA = `@${a.profile.handle}`;
  const nameB = `@${b.profile.handle}`;

  // Whoever has higher Focus reacts first every round — a real stat, not a
  // coin flip, so turn order can't be argument-order-dependent either.
  const aFirst = a.stats.focus >= b.stats.focus;

  let hpA = a.maxHp;
  let hpB = b.maxHp;
  const log = [];

  function cast(attacker, defender, attackerRng, hpDefender, mult) {
    const critChance = clamp(attacker.stats.focus / 100, 0, 1) * 0.25;
    const crit = attackerRng() < critChance;
    const base = 10 + attacker.stats.surge * 0.5;
    const jitter = 0.85 + attackerRng() * 0.3; // 0.85x-1.15x, own stream
    let dmg = base * mult * jitter * (crit ? 1.6 : 1);
    dmg *= 1 - defender.stats.ward / 100;
    dmg = Math.max(1, Math.round(dmg));
    const newHp = Math.max(0, hpDefender - dmg);
    return { dmg, crit, newHp };
  }

  function effectivenessWord(mult) {
    if (mult > 1) return "super effective";
    if (mult < 1) return "resisted";
    return "";
  }

  let round = 0;
  while (hpA > 0 && hpB > 0 && round < ROUND_CAP) {
    round++;
    const order = aFirst ? ["a", "b"] : ["b", "a"];
    for (const side of order) {
      if (hpA <= 0 || hpB <= 0) break;
      if (side === "a") {
        const r = cast(a, b, rngA, hpB, matchup);
        hpB = r.newHp;
        const eff = effectivenessWord(matchup);
        log.push({
          side: "a", spell: a.spell, dmg: r.dmg, crit: r.crit, eff,
          text: `${nameA} casts ${a.spell} — ${r.dmg} dmg${eff ? " (" + eff + ")" : ""}${r.crit ? " — critical cast!" : ""} on ${nameB}`,
          hpA, hpB,
        });
      } else {
        const r = cast(b, a, rngB, hpA, matchupInv);
        hpA = r.newHp;
        const eff = effectivenessWord(matchupInv);
        log.push({
          side: "b", spell: b.spell, dmg: r.dmg, crit: r.crit, eff,
          text: `${nameB} casts ${b.spell} — ${r.dmg} dmg${eff ? " (" + eff + ")" : ""}${r.crit ? " — critical cast!" : ""} on ${nameA}`,
          hpA, hpB,
        });
      }
    }
  }

  let winner;
  if (hpA <= 0 && hpB <= 0) winner = a.stats.reach >= b.stats.reach ? "a" : "b";
  else if (hpA <= 0) winner = "b";
  else if (hpB <= 0) winner = "a";
  else winner = hpA / a.maxHp >= hpB / b.maxHp ? "a" : "b";

  return {
    a: { ...a, hpStart: a.maxHp, hpEnd: Math.max(0, hpA) },
    b: { ...b, hpStart: b.maxHp, hpEnd: Math.max(0, hpB) },
    matchup, matchupInv, aFirst, log, winner, rounds: round,
  };
}

export { ELEMENT_GLYPH, ELEMENT_LABEL, BEATS };
