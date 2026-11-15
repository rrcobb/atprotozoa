// characters.js — every account in the simcluster is a fighter. A DID hashes to
// one of eight classes; each class has its own body, basic punch + kick, and
// two specials (U / I) with their own animation, cooldown and behaviour. The
// hash also nudges power / speed / weight a little so two ninjas aren't clones.
//
// Move spec fields (consumed by fighter.js):
//   kind     "melee" | "proj" | "blink" | "bolt"
//   anim     pose key in fighter.js ANIMS
//   range, dmg [lo,hi], startup/active/recovery (ms), kbBase, kbGrowth, angle (deg)
//   cd       cooldown in ms (specials only)
//   lunge    forward vx impulse at the end of startup; hop = vy impulse
//   both     hits in front and behind (ignores facing)
//   proj     { kind, speed, vy, grav, bounce, back, floor, life, size }   (kind "proj")
//   mode     "behind" | "swap"                                              (kind "blink")
//   bolt     { warn, strike, width }                                        (kind "bolt")

const DEG = Math.PI / 180;

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const melee = (o) => ({ kind: "melee", sfx: "punch", cd: 0, lunge: 0, hop: 0, both: false, ...o });
const jab = (name, o) => melee({ name, anim: "jab", ...o });
const kick = (name, o) => melee({ name, anim: "kick", sfx: "kick", ...o });

export const ARCHETYPES = [
  {
    id: "bruiser", label: "Bruiser", accent: "#ff8a3d", hat: "bandana",
    blurb: "slow, heavy, hard to launch",
    dims: { leg: 44, torso: 60, arm: 40, head: 21, lw: 7 },
    spd: 0.85, jump: 0.9, weight: 1.3, rating: { pow: 8, spd: 3, wgt: 9 },
    punch: jab("Hammer Fist", { range: 70, dmg: [6, 10], startup: 130, active: 90, recovery: 170, kbBase: 120, kbGrowth: 3.2, angle: 55 }),
    kick: kick("Boot Stomp", { range: 92, dmg: [9, 14], startup: 210, active: 100, recovery: 240, kbBase: 160, kbGrowth: 3.8, angle: 48 }),
    sp1: { kind: "proj", name: "Ground Pound", anim: "slam", sfx: "boom", cd: 3500, dmg: [8, 12], startup: 300, active: 60, recovery: 380, kbBase: 90, kbGrowth: 2.4, angle: 70, proj: { kind: "shock", speed: 330, floor: true, life: 1500, size: 18 } },
    sp2: melee({ name: "Haymaker", anim: "haymaker", sfx: "boom", cd: 4200, range: 92, dmg: [15, 22], startup: 420, active: 120, recovery: 420, kbBase: 230, kbGrowth: 5.2, angle: 40, lunge: 160 }),
  },
  {
    id: "ninja", label: "Ninja", accent: "#7dffb0", hat: "headband",
    blurb: "fast, light, thrown stars and teleports",
    dims: { leg: 46, torso: 48, arm: 36, head: 17, lw: 4 },
    spd: 1.2, jump: 1.15, weight: 0.85, rating: { pow: 4, spd: 9, wgt: 3 },
    punch: jab("Quick Jab", { range: 66, dmg: [4, 7], startup: 70, active: 70, recovery: 110, kbBase: 90, kbGrowth: 2.6, angle: 60 }),
    kick: kick("Crescent Kick", { anim: "roundhouse", range: 94, dmg: [7, 11], startup: 140, active: 90, recovery: 190, kbBase: 140, kbGrowth: 3.4, angle: 45 }),
    sp1: { kind: "proj", name: "Shuriken", anim: "throw", sfx: "whoosh", cd: 1500, dmg: [5, 8], startup: 170, active: 40, recovery: 200, kbBase: 80, kbGrowth: 2.2, angle: 40, proj: { kind: "star", speed: 780, life: 900, size: 9 } },
    sp2: { kind: "blink", mode: "behind", name: "Shadow Step", anim: "vanish", sfx: "whoosh", cd: 4500, dmg: [8, 12], startup: 220, active: 60, recovery: 260, kbBase: 140, kbGrowth: 3.5, angle: 55 },
  },
  {
    id: "mage", label: "Mage", accent: "#b66bff", hat: "wizard",
    blurb: "fireballs from range, a point-blank blast up close",
    dims: { leg: 46, torso: 50, arm: 36, head: 19, lw: 4.5 },
    spd: 0.95, jump: 1.0, weight: 0.9, rating: { pow: 6, spd: 5, wgt: 4 },
    punch: jab("Staff Rap", { range: 76, dmg: [4, 8], startup: 120, active: 90, recovery: 160, kbBase: 100, kbGrowth: 2.8, angle: 58 }),
    kick: kick("Hex Kick", { range: 92, dmg: [7, 11], startup: 190, active: 100, recovery: 220, kbBase: 140, kbGrowth: 3.5, angle: 50 }),
    sp1: { kind: "proj", name: "Fireball", anim: "cast", sfx: "cast", cd: 1800, dmg: [8, 12], startup: 240, active: 50, recovery: 300, kbBase: 130, kbGrowth: 3.3, angle: 40, proj: { kind: "orb", speed: 430, vy: -60, grav: 110, life: 1700, size: 14 } },
    sp2: melee({ name: "Arcane Nova", anim: "nova", sfx: "zap", cd: 4800, both: true, range: 125, dmg: [9, 14], startup: 360, active: 110, recovery: 380, kbBase: 210, kbGrowth: 4.6, angle: 62 }),
  },
  {
    id: "monk", label: "Monk", accent: "#ffd23f", hat: "topknot",
    blurb: "balanced, with a chi wave and a rising uppercut",
    dims: { leg: 48, torso: 50, arm: 40, head: 18, lw: 5 },
    spd: 1.0, jump: 1.0, weight: 1.0, rating: { pow: 6, spd: 6, wgt: 6 },
    punch: jab("Palm Strike", { range: 72, dmg: [5, 8], startup: 90, active: 80, recovery: 140, kbBase: 105, kbGrowth: 2.9, angle: 58 }),
    kick: kick("Tiger Kick", { range: 98, dmg: [8, 12], startup: 170, active: 100, recovery: 210, kbBase: 150, kbGrowth: 3.6, angle: 50 }),
    sp1: { kind: "proj", name: "Chi Wave", anim: "cast", sfx: "cast", cd: 2600, dmg: [7, 11], startup: 230, active: 50, recovery: 280, kbBase: 140, kbGrowth: 3.4, angle: 45, proj: { kind: "wave", speed: 360, life: 2000, size: 22 } },
    sp2: melee({ name: "Rising Dragon", anim: "uppercut", sfx: "boom", cd: 4000, range: 74, dmg: [10, 15], startup: 130, active: 200, recovery: 380, kbBase: 200, kbGrowth: 4.4, angle: 82, hop: -480, lunge: 90 }),
  },
  {
    id: "acrobat", label: "Acrobat", accent: "#4dd8ff", hat: "feather",
    blurb: "floaty and slippery: boomerang and a diving kick",
    dims: { leg: 52, torso: 44, arm: 38, head: 17, lw: 4 },
    spd: 1.1, jump: 1.25, weight: 0.8, rating: { pow: 4, spd: 8, wgt: 2 },
    punch: jab("Flick", { range: 68, dmg: [4, 7], startup: 80, active: 80, recovery: 120, kbBase: 90, kbGrowth: 2.6, angle: 60 }),
    kick: kick("Flip Kick", { anim: "roundhouse", range: 100, dmg: [7, 11], startup: 150, active: 100, recovery: 200, kbBase: 150, kbGrowth: 3.5, angle: 62 }),
    sp1: { kind: "proj", name: "Boomerang", anim: "throw", sfx: "whoosh", cd: 2400, dmg: [6, 9], startup: 190, active: 40, recovery: 220, kbBase: 100, kbGrowth: 2.6, angle: 55, proj: { kind: "boomerang", speed: 520, life: 1500, size: 12, back: true } },
    sp2: melee({ name: "Dive Kick", anim: "dive", sfx: "kick", cd: 3800, range: 78, dmg: [10, 15], startup: 140, active: 420, recovery: 220, kbBase: 170, kbGrowth: 4.0, angle: -50, hop: -500, lunge: 300 }),
  },
  {
    id: "boxer", label: "Boxer", accent: "#ff4d6d", hat: "gloves",
    blurb: "closes the gap with lunging punches",
    dims: { leg: 44, torso: 56, arm: 36, head: 20, lw: 6 },
    spd: 1.0, jump: 0.95, weight: 1.15, rating: { pow: 7, spd: 6, wgt: 7 },
    punch: jab("Cross", { range: 78, dmg: [6, 10], startup: 90, active: 80, recovery: 140, kbBase: 115, kbGrowth: 3.1, angle: 55 }),
    kick: kick("Low Kick", { range: 90, dmg: [7, 11], startup: 200, active: 100, recovery: 230, kbBase: 140, kbGrowth: 3.5, angle: 40 }),
    sp1: melee({ name: "Bolo Punch", anim: "lunge", cd: 3200, range: 100, dmg: [11, 16], startup: 260, active: 110, recovery: 320, kbBase: 190, kbGrowth: 4.4, angle: 45, lunge: 380 }),
    sp2: melee({ name: "Gazelle Rush", anim: "lunge", sfx: "boom", cd: 3600, range: 120, dmg: [9, 14], startup: 160, active: 180, recovery: 340, kbBase: 200, kbGrowth: 4.2, angle: 35, lunge: 620 }),
  },
  {
    id: "trickster", label: "Trickster", accent: "#ff9ff3", hat: "tophat",
    blurb: "bouncing bombs and swapping places",
    dims: { leg: 45, torso: 46, arm: 36, head: 20, lw: 4.5 },
    spd: 1.05, jump: 1.1, weight: 0.85, rating: { pow: 5, spd: 7, wgt: 3 },
    punch: jab("Slap", { range: 64, dmg: [4, 7], startup: 80, active: 70, recovery: 120, kbBase: 90, kbGrowth: 2.6, angle: 60 }),
    kick: kick("Trip", { range: 88, dmg: [6, 10], startup: 160, active: 90, recovery: 200, kbBase: 130, kbGrowth: 3.3, angle: 48 }),
    sp1: { kind: "proj", name: "Bouncing Bomb", anim: "throw", sfx: "whoosh", cd: 2800, dmg: [9, 13], startup: 230, active: 40, recovery: 260, kbBase: 150, kbGrowth: 3.6, angle: 55, proj: { kind: "bomb", speed: 300, vy: -200, grav: 1100, bounce: true, life: 2400, size: 13 } },
    sp2: { kind: "blink", mode: "swap", name: "Switcheroo", anim: "vanish", sfx: "whoosh", cd: 4200, dmg: [0, 0], stun: 450, startup: 180, active: 60, recovery: 220, kbBase: 0, kbGrowth: 0, angle: 0 },
  },
  {
    id: "storm", label: "Storm", accent: "#8ab4ff", hat: "spikes",
    blurb: "a spinning whirlwind and a lightning strike you can see coming",
    dims: { leg: 46, torso: 50, arm: 38, head: 19, lw: 5 },
    spd: 1.0, jump: 1.05, weight: 0.95, rating: { pow: 6, spd: 6, wgt: 5 },
    punch: jab("Static Jab", { range: 72, dmg: [5, 8], startup: 100, active: 80, recovery: 150, kbBase: 105, kbGrowth: 2.9, angle: 58 }),
    kick: kick("Gale Kick", { range: 96, dmg: [8, 12], startup: 180, active: 100, recovery: 220, kbBase: 145, kbGrowth: 3.6, angle: 50 }),
    sp1: melee({ name: "Whirlwind", anim: "spin", sfx: "whoosh", cd: 3200, both: true, range: 100, dmg: [8, 12], startup: 200, active: 260, recovery: 300, kbBase: 170, kbGrowth: 3.8, angle: 55 }),
    sp2: { kind: "bolt", name: "Thunderstrike", anim: "summon", sfx: "zap", cd: 5000, dmg: [14, 20], startup: 260, active: 40, recovery: 340, kbBase: 220, kbGrowth: 4.8, angle: 78, bolt: { warn: 520, strike: 160, width: 40 } },
  },
];

export const SLOTS = ["punch", "kick", "sp1", "sp2"];
export const SLOT_KEYS = { punch: "J", kick: "K", sp1: "U", sp2: "I" };

const firstName = (m) => {
  const w = (m.displayName || "").split(/\s+/).map((s) => s.replace(/[^\p{L}\p{N}]/gu, "")).find(Boolean);
  return w || (m.handle || "").split(".")[0];
};

const cache = new Map();

// characterFor(account) -> a fighter sheet. Deterministic per DID.
export function characterFor(m) {
  const key = m.did || m.handle || "";
  if (cache.has(key)) return cache.get(key);
  const h = hash(key);
  const arch = ARCHETYPES[h % ARCHETYPES.length];
  const v = (shift) => ((h >>> shift) & 255) / 255; // 0..1 wobble
  const pow = 0.93 + 0.14 * v(8);
  const spd = arch.spd * (0.94 + 0.12 * v(16));
  const weight = arch.weight * (0.94 + 0.12 * v(24));
  const wob = (r, x) => Math.max(1, Math.min(10, r + Math.round((x - 0.5) * 2)));
  const name = firstName(m);

  const moves = {};
  for (const slot of SLOTS) {
    const s = arch[slot];
    moves[slot] = { ...s, slot, angle: s.angle * DEG, cd: s.cd || 0 };
    if (slot === "sp1" || slot === "sp2") moves[slot].title = `${name}'s ${s.name}`;
  }
  const sheet = {
    id: arch.id, label: arch.label, accent: arch.accent, hat: arch.hat, blurb: arch.blurb,
    dims: arch.dims, spd, jump: arch.jump, weight, pow, moves,
    stats: { pow: wob(arch.rating.pow, v(8)), spd: wob(arch.rating.spd, v(16)), wgt: wob(arch.rating.wgt, v(24)) },
  };
  cache.set(key, sheet);
  return sheet;
}
