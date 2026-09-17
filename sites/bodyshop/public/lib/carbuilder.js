// carbuilder.js — pure randomization. No DOM, no network. A "build" is a
// plain object describing one pulled car; carbuilder never draws anything
// (see cargen.js for that) and never touches localStorage (see app.js).
//
// Every pull is seeded (mulberry32, not Math.random) so a build can be
// reproduced from a small integer. That seed rides in the share URL
// (?b=<seed>) so a shared link always redraws the exact same car for
// whoever opens it, the same way a shared seed reproduces a level.

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

export const TIERS = [
  { id: "junker", label: "Junker", weight: 55, color: "#9aa0ad" },
  { id: "driver", label: "Daily Driver", weight: 27, color: "#6ef2a0" },
  { id: "tuned", label: "Tuned", weight: 12, color: "#4ea1ff" },
  { id: "showcar", label: "Show Car", weight: 5, color: "#c084fc" },
  { id: "grail", label: "Grail", weight: 1, color: "#ffd24e" },
];
const TIER_ORDER = Object.fromEntries(TIERS.map((t, i) => [t.id, i]));
export function tierRank(id) {
  return TIER_ORDER[id] ?? TIERS.length;
}

export const BODIES = [
  { id: "sedan", label: "Sedan", family: "low" },
  { id: "coupe", label: "Coupe", family: "low" },
  { id: "wagon", label: "Wagon", family: "wagon" },
  { id: "hatch", label: "Hatchback", family: "hatch" },
  { id: "pickup", label: "Pickup", family: "truck" },
  { id: "van", label: "Van", family: "boxy" },
  { id: "lowrider", label: "Lowrider", family: "low" },
  { id: "kei", label: "Kei Truck", family: "boxy" },
  { id: "muscle", label: "Muscle Car", family: "low" },
  { id: "convertible", label: "Convertible", family: "low" },
];

const KITS = [
  { id: "stock", label: "Stock" },
  { id: "widebody", label: "Widebody" },
  { id: "slammed", label: "Slammed" },
  { id: "lifted", label: "Lifted" },
  { id: "bosozoku", label: "Bosozoku" },
  { id: "drift", label: "Drift-Spec" },
];

const WHEELS = [
  { id: "steelies", label: "Steelies", spokes: 4 },
  { id: "alloys", label: "Alloys", spokes: 6 },
  { id: "deepdish", label: "Deep-Dish", spokes: 5 },
  { id: "spinners", label: "Spinners", spokes: 8 },
  { id: "offroad", label: "Off-Road", spokes: 6 },
  { id: "forged", label: "Forged", spokes: 10 },
];

const SPOILERS = [
  { id: "none", label: "" },
  { id: "none", label: "" },
  { id: "ducktail", label: "Ducktail Spoiler" },
  { id: "wing", label: "Wing" },
  { id: "gtwing", label: "GT Wing" },
  { id: "roofspoiler", label: "Roof Spoiler" },
];

const FINISHES = {
  patina: { id: "patina", label: "Patina" },
  matte: { id: "matte", label: "Matte" },
  gloss: { id: "gloss", label: "Gloss" },
  metallic: { id: "metallic", label: "Metallic" },
  pearl: { id: "pearl", label: "Pearl" },
  chrome: { id: "chrome", label: "Chrome" },
};
function finishPoolFor(tierId) {
  if (tierId === "junker") return [FINISHES.patina, FINISHES.matte, FINISHES.gloss];
  if (tierId === "driver") return [FINISHES.matte, FINISHES.gloss, FINISHES.metallic];
  if (tierId === "tuned") return [FINISHES.gloss, FINISHES.metallic, FINISHES.pearl];
  if (tierId === "showcar") return [FINISHES.metallic, FINISHES.pearl, FINISHES.chrome];
  return [FINISHES.pearl, FINISHES.chrome]; // grail
}

const EXTRAS = [
  { id: "underglow", label: "Underglow" },
  { id: "flames", label: "Flame Decals" },
  { id: "stripe", label: "Racing Stripe" },
  { id: "roofrack", label: "Roof Rack" },
  { id: "tint", label: "Tinted Windows" },
  { id: "nitrous", label: "Nitrous Kit" },
  { id: "plate", label: "Joke Plate" },
];
const PLATE_JOKES = [
  "LOL BSKY", "NO RAGRETS", "404 CARR", "BLOCK ME", "MUTUAL", "VRYFAST",
  "RUSTY", "GRAIL", "BEEP BEEP", "SKEET IT", "ONE MOOT",
];
const COLOR_NAMES = [
  [15, "Rust Red"], [30, "Burnt Orange"], [45, "Sunflower Yellow"],
  [75, "Lime Green"], [140, "Forest Green"], [170, "Seafoam Teal"],
  [200, "Sky Blue"], [225, "Cobalt Blue"], [255, "Grape Purple"],
  [285, "Violet"], [320, "Hot Pink"], [345, "Crimson"], [361, "Rust Red"],
];
function nameForHue(hue) {
  for (const [max, name] of COLOR_NAMES) {
    if (hue <= max) return name;
  }
  return "Rust Red";
}

export function rollBuild(rng, seed) {
  const tier = pickWeighted(rng, TIERS);
  const body = pick(rng, BODIES);
  const kit = pick(rng, KITS);
  const wheels = pick(rng, WHEELS);
  const spoiler = pick(rng, SPOILERS);
  const finish = pick(rng, finishPoolFor(tier.id));
  const hue = Math.floor(rng() * 360);
  const colorName = nameForHue(hue);
  const year = 1978 + Math.floor(rng() * 48);

  const extraSlots = { junker: 0, driver: 1, tuned: 1, showcar: 2, grail: 3 }[tier.id];
  const pool = [...EXTRAS];
  const extras = [];
  for (let i = 0; i < extraSlots && pool.length; i++) {
    if (rng() < 0.55) continue; // even at max slots, not guaranteed full
    const idx = Math.floor(rng() * pool.length);
    extras.push(pool.splice(idx, 1)[0]);
  }
  const plate = extras.some((e) => e.id === "plate") ? pick(rng, PLATE_JOKES) : null;

  return { seed, tier, body, kit, wheels, spoiler, finish, hue, colorName, year, extras, plate };
}

export function buildTitle(build) {
  return `${build.year} ${build.finish.label} ${build.colorName} ${build.body.label}`;
}

export function buildSubtitle(build) {
  const parts = [];
  if (build.kit.id !== "stock") parts.push(build.kit.label);
  parts.push(build.wheels.label + " Wheels");
  if (build.spoiler.label) parts.push(build.spoiler.label);
  for (const e of build.extras) {
    parts.push(e.id === "plate" ? `Plate "${build.plate}"` : e.label);
  }
  return parts.join(" · ");
}
