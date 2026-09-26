// tuberbuilder.js — pure randomization. No DOM, no network. A "build" is a
// plain object describing one rolled tubersona; tuberbuilder never draws
// anything (see tubergen.js for that) and never touches localStorage (see
// app.js). Copied from sites/bodyshop's carbuilder.js/cargen.js split.
//
// Every roll is seeded (mulberry32, not Math.random) so a tubersona can be
// reproduced from a small integer. That seed rides in the share URL
// (?b=<seed>) so a shared link always redraws the exact same tuber for
// whoever opens it.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomSeed() {
  return crypto.getRandomValues(new Uint32Array(1))[0];
}

function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length) % arr.length];
}

function pickWeighted(rng, items) {
  const total = items.reduce((sum, it) => sum + it.weight, 0);
  let roll = rng() * total;
  for (const it of items) {
    roll -= it.weight;
    if (roll <= 0) return it;
  }
  return items[items.length - 1];
}

// Number of angular samples around the blob outline. Fixed so bumps/spuds
// arrays generated at roll time always match what tubergen.js expects.
export const POINTS = 14;

export const TIERS = [
  { id: "sprout", label: "Sprout", weight: 55, color: "#8fae63" },
  { id: "fresh", label: "Fresh", weight: 27, color: "#e0b04a" },
  { id: "seasoned", label: "Seasoned", weight: 12, color: "#d9773f" },
  { id: "prized", label: "Prized", weight: 5, color: "#c084fc" },
  { id: "heirloom", label: "Heirloom", weight: 1, color: "#ffd24e" },
];
const TIER_ORDER = Object.fromEntries(TIERS.map((t, i) => [t.id, i]));
export function tierRank(id) {
  return TIER_ORDER[id] ?? TIERS.length;
}

// "circuit" is reserved for buildthis's own tubersona (see buildthisTuber
// below) — it never comes up in a random roll.
export const VARIETIES = [
  { id: "russet", label: "Russet", skin: "#a9784f", shade: "#7a5537", highlight: "#c99a6c" },
  { id: "purple", label: "Purple Majesty", skin: "#7a5b93", shade: "#573f6b", highlight: "#9c7ab5" },
  { id: "yukon", label: "Yukon Gold", skin: "#d9b45a", shade: "#ab8636", highlight: "#eecd7f" },
  { id: "redbliss", label: "Red Bliss", skin: "#b5533f", shade: "#8a3a2a", highlight: "#d17a63" },
  { id: "sweet", label: "Sweet", skin: "#c9793a", shade: "#9c5824", highlight: "#e29b5c" },
  { id: "fingerling", label: "Fingerling", skin: "#b89a6a", shade: "#8c7148", highlight: "#d3ba8d" },
];
export const CIRCUIT_VARIETY = { id: "circuit", label: "Circuit Grey", skin: "#8a93a6", shade: "#5f6779", highlight: "#c7ceda" };

export const SHAPES = [
  { id: "round", label: "Round", rx: 88, ry: 82, bump: 0.05 },
  { id: "oblong", label: "Oblong", rx: 100, ry: 68, bump: 0.05 },
  { id: "knobby", label: "Knobby", rx: 86, ry: 80, bump: 0.16 },
  { id: "stubby", label: "Stubby", rx: 76, ry: 92, bump: 0.09 },
];

export const SPUD_DENSITIES = [
  { id: "sparse", label: "Sparse Eyes", count: 2 },
  { id: "freckled", label: "Freckled", count: 4 },
  { id: "dense", label: "Dense-Eyed", count: 7 },
];

export const SPROUTS = [
  { id: "bald", label: "" },
  { id: "bald", label: "" },
  { id: "single", label: "Single Sprout" },
  { id: "leafy", label: "Leafy Sprout" },
  { id: "roots", label: "Root Tuft" },
];

export const ACCESSORIES = {
  none: { id: "none", label: "" },
  bandana: { id: "bandana", label: "Bandana" },
  mustache: { id: "mustache", label: "Mustache" },
  monocle: { id: "monocle", label: "Monocle" },
  eyepatchL: { id: "eyepatchL", label: "Eyepatch" },
  eyepatchR: { id: "eyepatchR", label: "Eyepatch" },
  tophat: { id: "tophat", label: "Top Hat" },
  katana: { id: "katana", label: "Katana" },
  wrench: { id: "wrench", label: "Wrench" },
};

// Mirrors bodyshop's finishPoolFor(tierId): rarer tiers unlock flashier
// accessories, common tiers mostly go bare or plain.
function accessoryPoolFor(tierId) {
  const A = ACCESSORIES;
  if (tierId === "sprout") return [A.none, A.none, A.none, A.bandana];
  if (tierId === "fresh") return [A.none, A.none, A.bandana, A.mustache];
  if (tierId === "seasoned") return [A.bandana, A.mustache, A.monocle, A.eyepatchL, A.eyepatchR];
  if (tierId === "prized") return [A.monocle, A.eyepatchL, A.eyepatchR, A.tophat, A.katana];
  return [A.katana, A.tophat, A.wrench, A.eyepatchL, A.eyepatchR]; // heirloom
}

function rollBumps(rng, amt) {
  return Array.from({ length: POINTS }, () => 1 + (rng() * 2 - 1) * amt);
}

function rollSpuds(rng, count) {
  return Array.from({ length: count }, () => ({
    a: rng() * Math.PI * 2,
    r: 0.35 + rng() * 0.5,
    size: 2 + rng() * 2.2,
  }));
}

function assembleBuild(rng, seed, picks) {
  const { tier, variety, shape, eyeCount, spudDensity, sprout, accessory } = picks;
  return {
    seed,
    tier,
    variety,
    shape,
    bumps: rollBumps(rng, shape.bump),
    eyeCount,
    spudDensity,
    spuds: rollSpuds(rng, spudDensity.count),
    sprout,
    accessory,
  };
}

export function rollBuild(rng, seed) {
  const tier = pickWeighted(rng, TIERS);
  const variety = pick(rng, VARIETIES);
  const shape = pick(rng, SHAPES);
  const eyeCount = pickWeighted(rng, [
    { id: 1, weight: 15 },
    { id: 2, weight: 70 },
    { id: 3, weight: 15 },
  ]).id;
  const spudDensity = pick(rng, SPUD_DENSITIES);
  const sprout = pick(rng, SPROUTS);
  const accessory = pick(rng, accessoryPoolFor(tier.id));
  return assembleBuild(rng, seed, { tier, variety, shape, eyeCount, spudDensity, sprout, accessory });
}

// buildthis's own tubersona — the answer to "what's your tubersona?". Fixed
// traits (see notes/history for the ask this answers), but bumps/spuds still
// come out of the same seeded pipeline as any other roll so it renders with
// the same code path as a random tuber.
const BUILDTHIS_SEED = 0xb17d0107;
export function buildthisTuber() {
  const rng = mulberry32(BUILDTHIS_SEED);
  return assembleBuild(rng, BUILDTHIS_SEED, {
    tier: { id: "buildbot", label: "Build Bot", color: "#7dd3fc" },
    variety: CIRCUIT_VARIETY,
    shape: SHAPES.find((s) => s.id === "knobby"),
    eyeCount: 2,
    spudDensity: SPUD_DENSITIES.find((s) => s.id === "sparse"),
    sprout: SPROUTS.find((s) => s.id === "bald"),
    accessory: ACCESSORIES.wrench,
  });
}

export function buildTitle(build) {
  return `${build.tier.label} ${build.variety.label} Tubersona`;
}

export function buildSubtitle(build) {
  const parts = [build.shape.label, `${build.eyeCount} eye${build.eyeCount === 1 ? "" : "s"}`];
  if (build.sprout.label) parts.push(build.sprout.label);
  if (build.accessory.label) parts.push(build.accessory.label);
  return parts.join(" · ");
}
