// short-circuit: a generator for one very specific joke shape, tagged into
// being by an example someone gave @buildthis — "a man eating peas with the
// idea that they will improve his virility shovels them straight into his
// lap." The joke is a broken causal chain: [substance] is supposed to flow
// input → process (eat/drink/rub) → bloodstream → [effect], but the subject
// shorts the circuit and applies it directly to the body part where the
// effect is supposed to show up, skipping the middleman entirely.

// mulberry32 — deterministic PRNG from a 32-bit seed, so a shared link
// (?s=<seed>) always reproduces the exact same joke.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomSeed() {
  return (Math.random() * 0xffffffff) >>> 0;
}

// Each person carries the possessive it needs so the sentence stays
// grammatically consistent regardless of who got picked.
const PEOPLE = [
  { label: "a man", poss: "his" },
  { label: "a woman", poss: "her" },
  { label: "my uncle", poss: "his" },
  { label: "my aunt", poss: "her" },
  { label: "the guy at my gym", poss: "his" },
  { label: "the new intern", poss: "their" },
  { label: "a substitute teacher", poss: "their" },
  { label: "someone's dad", poss: "his" },
  { label: "the barista", poss: "their" },
  { label: "a bodybuilder", poss: "their" },
  { label: "a stranger at the bus stop", poss: "their" },
  { label: "the guy from accounting", poss: "his" },
  { label: "my landlord", poss: "their" },
  { label: "a substitute lifeguard", poss: "their" },
  { label: "a man on the internet", poss: "his" },
  { label: "a woman on the internet", poss: "her" },
  { label: "a guy named Kevin", poss: "his" },
  { label: "a guy named Steve", poss: "his" },
  { label: "a woman named Deb", poss: "her" },
  { label: "a raccoon in a cardigan", poss: "its" },
];

// Each scenario is a self-contained causal chain: an item believed to
// produce `goal`, the normal way you'd take it (`take`), and the exact spot
// the effect is supposed to land (`spot`) — which is where it gets shorted
// to instead, via `apply`. `plural` picks it/they, them/it agreement.
// `goal` is a bare noun — the template supplies the possessive itself
// ("improve his `virility`"), so don't bake one into the string here.
const SCENARIOS = [
  { item: "peas", plural: true, take: "eating", goal: "virility", spot: "lap", apply: "shovels" },
  { item: "oysters", plural: true, take: "eating", goal: "virility", spot: "lap", apply: "tips" },
  { item: "spinach", plural: false, take: "eating", goal: "muscles", spot: "biceps", apply: "rubs" },
  { item: "carrots", plural: true, take: "eating", goal: "eyesight", spot: "eyes", apply: "squeezes" },
  { item: "fish oil", plural: false, take: "taking", goal: "brainpower", spot: "forehead", apply: "pours" },
  { item: "salmon", plural: false, take: "eating", goal: "hair", spot: "scalp", apply: "rubs" },
  { item: "garlic", plural: false, take: "eating", goal: "luck", spot: "neck", apply: "tapes" },
  { item: "protein powder", plural: false, take: "drinking", goal: "muscles", spot: "biceps", apply: "dumps" },
  { item: "honey", plural: false, take: "eating", goal: "voice", spot: "throat", apply: "pours" },
  { item: "beets", plural: true, take: "eating", goal: "stamina", spot: "calves", apply: "mashes" },
  { item: "coffee grounds", plural: true, take: "drinking", goal: "alertness", spot: "eyelids", apply: "rubs" },
  { item: "ginseng", plural: false, take: "chewing", goal: "stamina", spot: "legs", apply: "tapes" },
  { item: "dark chocolate", plural: false, take: "eating", goal: "mood", spot: "chest", apply: "presses" },
  { item: "bananas", plural: true, take: "eating", goal: "energy", spot: "calves", apply: "straps" },
  { item: "milk", plural: false, take: "drinking", goal: "bones", spot: "shins", apply: "pours" },
  { item: "eggs", plural: true, take: "eating", goal: "beard", spot: "chin", apply: "cracks" },
  { item: "turmeric", plural: false, take: "eating", goal: "skin", spot: "cheeks", apply: "rubs" },
  { item: "bone broth", plural: false, take: "drinking", goal: "joints", spot: "knees", apply: "pours" },
  { item: "yogurt", plural: false, take: "eating", goal: "gut health", spot: "stomach", apply: "smears" },
  { item: "green tea", plural: false, take: "drinking", goal: "figure", spot: "waist", apply: "pours" },
  { item: "almonds", plural: true, take: "eating", goal: "memory", spot: "temples", apply: "presses" },
  { item: "red wine", plural: false, take: "drinking", goal: "heart health", spot: "chest", apply: "pours" },
  { item: "blueberries", plural: true, take: "eating", goal: "vision", spot: "eyes", apply: "mashes" },
];

function pick(rand, arr) {
  return arr[Math.floor(rand() * arr.length)];
}

// Builds the sentence and returns the pieces too, in case the UI wants to
// highlight the item/spot separately.
export function generate(seed) {
  const rand = mulberry32(seed);
  const person = pick(rand, PEOPLE);
  const scenario = pick(rand, SCENARIOS);
  const pron = scenario.plural ? "they" : "it";
  const pron2 = scenario.plural ? "them" : "it";
  const text =
    `${person.label}, ${scenario.take} ${scenario.item} with the idea that ` +
    `${pron} will improve ${person.poss} ${scenario.goal}, ${scenario.apply} ` +
    `${pron2} straight into ${person.poss} ${scenario.spot}.`;
  return { text, person, scenario, seed };
}
