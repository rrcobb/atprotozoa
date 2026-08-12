// The engine behind whoworethem. Built from the first post the open
// firehose produced: a museum photo of a pair of 2,000-year-old Roman
// leather briefs dug out of a backfilled well in London, captioned
// "probably worn by young girls who were acrobatic dancers" — and a reply
// asking the only real question left: "Who wore them?"
//
// Nobody kept her name. That's the whole point, so this generator never
// pretends to know it — it always hands back a placeholder ("let's call
// them ___") next to a small, concrete, unverifiable guess. Same mechanic
// as sites/antecedent's idea engine: deterministic from a seed, so a result
// is a shareable, reproducible URL, not a live reroll that changes under
// you.

// ---- tiny seeded PRNG (mulberry32) — no crypto needed, just reproducible --
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

export function newSeed() {
  try {
    return crypto.getRandomValues(new Uint32Array(1))[0];
  } catch {
    return Math.floor(Math.random() * 4294967296);
  }
}

function pick(rng, list) {
  return list[Math.floor(rng() * list.length)];
}

// ---- word banks -----------------------------------------------------------

const ERAS = [
  { label: "Roman Britain, 1st–4th century CE", places: ["a garrison town on the Thames", "a bathhouse on the road to Verulamium", "a trading wharf on the tidal river"] },
  { label: "Bronze Age Scandinavia, ~1500 BCE", places: ["a peat bog above a fjord", "a burial mound cut into a birch forest", "a lakeside settlement of turf houses"] },
  { label: "Tang dynasty China, 7th–9th century CE", places: ["a silk market in Chang'an", "a monastery waystation on the trade road", "a dye house by the canal"] },
  { label: "Viking-age Norway, 9th–11th century CE", places: ["a longhouse on a fjord", "a trading post at a river mouth", "a boat-grave field above the tideline"] },
  { label: "Kingdom of Kush, Nubia, ~700 BCE–300 CE", places: ["a temple complex on the Nile", "a riverside market below the pyramids", "a gold-workers' quarter"] },
  { label: "Mississippian North America, ~1000–1400 CE", places: ["a mound-top plaza", "a river-trade town", "a palisaded village at a confluence"] },
  { label: "Song dynasty China, 10th–13th century CE", places: ["a ceramics port city", "a paper workshop off the canal", "a tea house by the city gate"] },
  { label: "Fatimid-era Cairo, 10th–12th century CE", places: ["a textile workshop off the market", "a Nile-side dye house", "a caravanserai courtyard"] },
  { label: "Classical Greece, 5th century BCE", places: ["a potter's quarter in Athens", "a gymnasium courtyard", "a harbor town on the Aegean"] },
  { label: "New Kingdom Egypt, ~1300 BCE", places: ["a workers' village at the edge of the desert", "a temple storeroom at Thebes", "a boat-builders' yard on the Nile"] },
];

const ROLES = [
  "an acrobat's apprentice, small enough the laces still had room to grow",
  "a temple dancer, in training three mornings a week",
  "a weaver's daughter, more often barefoot than not",
  "a soldier's son, left behind when the garrison marched on",
  "a coin-clipper's apprentice, quick enough never to be caught twice",
  "a midwife's assistant, trusted to carry the good instruments",
  "a glassblower's daughter, who could name every color of a bad batch",
  "an itinerant tinker, who mended more than she ever kept",
  "a ferryman's son, who knew the current better than his own name",
  "a scribe's apprentice, who never once misspelled the tax rolls",
  "a diver for river offerings, who kept exactly one for herself",
  "a court musician's understudy, who never got to play the good room",
  "a potter's youngest, who signed nothing because nobody let her yet",
  "a runner between market stalls, paid in whatever didn't sell",
];

const PLACEHOLDER_NAMES = [
  "M.", "the girl in the third row", "no one's daughter, officially",
  "the acrobat", "whoever laced it up that morning", "a name we don't have",
  "the one the record skips", "someone's youngest", "the understudy",
  "just a case number, for now", "the one who never got a stone",
];

const DETAILS_GENERIC = [
  "we know the size. we don't know the person, and that's the part that stays with you.",
  "somebody tied it, wore it, took it off, and never came back for it.",
  "the museum label hedges with \"probably\" three times in two sentences — which is honest, at least.",
  "two thousand years is long enough that even the guess is a kind of tribute.",
  "it survived by accident, in a well nobody meant to fill in.",
  "the object outlasted the sentence anyone could write about who owned it.",
  "there's a whole life balanced on one worn stitch, and we'll never see the rest of it.",
];

const DETAILS_WITH_DESC = [
  "hold {desc} up next to that and the gap between object and owner gets very small, very fast.",
  "{desc} is the same shape of question: something survived, and the person didn't leave a name behind it.",
  "whatever it was they were still holding onto, it probably looked a little like {desc}.",
  "put {desc} in a case in three thousand years and someone will write \"probably\" about you too.",
];

// ---- assembly ---------------------------------------------------------

function truncate(s, n) {
  s = s.trim();
  return s.length > n ? s.slice(0, n - 1).trim() + "…" : s;
}

export function generate(seed, description) {
  const rng = mulberry32(seed);
  const era = pick(rng, ERAS);
  const place = pick(rng, era.places);
  const role = pick(rng, ROLES);
  const name = pick(rng, PLACEHOLDER_NAMES);
  const desc = (description || "").trim();

  let detail;
  if (desc && rng() < 0.65) {
    detail = pick(rng, DETAILS_WITH_DESC).replace("{desc}", truncate(desc, 60));
  } else {
    detail = pick(rng, DETAILS_GENERIC);
  }

  const vignette =
    `Let's call them ${name}. Best guess: ${role}, somewhere around ${place}, ` +
    `${era.label}. ${detail}`;

  return { seed, description: desc, era: era.label, place, role, name, detail, vignette };
}

export function buildShareText(idea) {
  const obj = idea.description ? `"${truncate(idea.description, 80)}"` : "a found object";
  return `who wore ${obj}? ${idea.vignette}`;
}
