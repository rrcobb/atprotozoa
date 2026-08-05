// synastry.js — turns two raw charts (from astro.js) into the stuff a person
// actually reads: sign placements, elemental "temperament," and the cross-chart
// aspect list that drives the 3D geometry between the two wheels.

import { ZODIAC, signOf } from "./astro.js";

export const BODIES = ["sun", "moon", "mercury", "venus", "mars", "jupiter", "saturn", "uranus", "neptune", "pluto"];

export const BODY_META = {
  sun: { name: "Sun", glyph: "☉", abbr: "Su", domain: "core identity and vitality", weight: 5 },
  moon: { name: "Moon", glyph: "☽", abbr: "Mo", domain: "emotional needs and instincts", weight: 5 },
  mercury: { name: "Mercury", glyph: "☿", abbr: "Me", domain: "communication and thinking style", weight: 3 },
  venus: { name: "Venus", glyph: "♀", abbr: "Ve", domain: "affection, values and attraction", weight: 4 },
  mars: { name: "Mars", glyph: "♂", abbr: "Ma", domain: "drive, desire and assertion", weight: 4 },
  jupiter: { name: "Jupiter", glyph: "♃", abbr: "Ju", domain: "optimism, growth and excess", weight: 2 },
  saturn: { name: "Saturn", glyph: "♄", abbr: "Sa", domain: "structure, caution and responsibility", weight: 3 },
  uranus: { name: "Uranus", glyph: "♅", abbr: "Ur", domain: "independence, disruption and surprise", weight: 1 },
  neptune: { name: "Neptune", glyph: "♆", abbr: "Ne", domain: "imagination, idealization and blur", weight: 1 },
  pluto: { name: "Pluto", glyph: "♇", abbr: "Pl", domain: "intensity, control and transformation", weight: 1 },
  asc: { name: "Ascendant", glyph: "ASC", abbr: "Asc", domain: "first impression and outward persona", weight: 3 },
  mc: { name: "Midheaven", glyph: "MC", abbr: "MC", domain: "ambition and public role", weight: 1 },
};

const ELEMENT_OF_SIGN = {
  Aries: "fire", Leo: "fire", Sagittarius: "fire",
  Taurus: "earth", Virgo: "earth", Capricorn: "earth",
  Gemini: "air", Libra: "air", Aquarius: "air",
  Cancer: "water", Scorpio: "water", Pisces: "water",
};
const MODALITY_OF_SIGN = {
  Aries: "cardinal", Cancer: "cardinal", Libra: "cardinal", Capricorn: "cardinal",
  Taurus: "fixed", Leo: "fixed", Scorpio: "fixed", Aquarius: "fixed",
  Gemini: "mutable", Virgo: "mutable", Sagittarius: "mutable", Pisces: "mutable",
};

const TEMPERAMENT_OF_ELEMENT = {
  fire: { name: "Choleric", blurb: "quick to start, quick to want, quick to move on" },
  earth: { name: "Melancholic", blurb: "careful, grounded, slow to trust and slower to let go" },
  air: { name: "Sanguine", blurb: "curious, social, happiest when things keep changing" },
  water: { name: "Phlegmatic", blurb: "receptive, moody in the literal sense — run by the tide of feeling" },
};

export const ASPECTS = [
  { name: "conjunction", angle: 0, orb: 8, glyph: "☌", quality: "neutral" },
  { name: "sextile", angle: 60, orb: 4, glyph: "⚹", quality: "harmonious" },
  { name: "square", angle: 90, orb: 6, glyph: "□", quality: "tense" },
  { name: "trine", angle: 120, orb: 6, glyph: "△", quality: "harmonious" },
  { name: "quincunx", angle: 150, orb: 3, glyph: "⚻", quality: "tense" },
  { name: "opposition", angle: 180, orb: 8, glyph: "☍", quality: "tense" },
];

function circularDiff(a, b) {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

export function matchAspect(diff) {
  let best = null;
  for (const asp of ASPECTS) {
    const delta = Math.abs(diff - asp.angle);
    if (delta <= asp.orb && (!best || delta < best.delta)) {
      best = { ...asp, delta };
    }
  }
  return best;
}

// { sun: {lon}, moon: {lon}, ... } -> per-body sign placement.
export function placements(positions) {
  const out = {};
  for (const body of Object.keys(positions)) {
    out[body] = { lon: positions[body].lon, ...signOf(positions[body].lon) };
  }
  return out;
}

export function temperament(positions) {
  const counts = { fire: 0, earth: 0, air: 0, water: 0 };
  const modCounts = { cardinal: 0, fixed: 0, mutable: 0 };
  let total = 0;
  for (const body of BODIES) {
    const p = positions[body];
    if (!p) continue;
    const sign = signOf(p.lon).sign;
    counts[ELEMENT_OF_SIGN[sign]] += BODY_META[body].weight;
    modCounts[MODALITY_OF_SIGN[sign]] += BODY_META[body].weight;
    total += BODY_META[body].weight;
  }
  const elementPct = {};
  for (const k of Object.keys(counts)) elementPct[k] = counts[k] / total;
  const modalityPct = {};
  for (const k of Object.keys(modCounts)) modalityPct[k] = modCounts[k] / total;

  const dominantElement = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
  const dominantModality = Object.keys(modCounts).sort((a, b) => modCounts[b] - modCounts[a])[0];

  return {
    elementPct,
    modalityPct,
    dominantElement,
    dominantModality,
    temperament: TEMPERAMENT_OF_ELEMENT[dominantElement],
  };
}

// Every cross-chart pairing of bodies (+ angles, if provided) between two
// charts that lands within an aspect's orb, sorted tightest-first.
export function synastryAspects(posA, posB) {
  const bodiesA = Object.keys(posA);
  const bodiesB = Object.keys(posB);
  const out = [];
  for (const ba of bodiesA) {
    for (const bb of bodiesB) {
      const diff = circularDiff(posA[ba].lon, posB[bb].lon);
      const aspect = matchAspect(diff);
      if (aspect) out.push({ bodyA: ba, bodyB: bb, diff, aspect });
    }
  }
  out.sort((x, y) => x.aspect.delta - y.aspect.delta);
  return out;
}

// Aspects within a single chart (for drawing the natal chord pattern on one wheel).
export function natalAspects(positions) {
  const bodies = Object.keys(positions);
  const out = [];
  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      const diff = circularDiff(positions[bodies[i]].lon, positions[bodies[j]].lon);
      const aspect = matchAspect(diff);
      if (aspect) out.push({ bodyA: bodies[i], bodyB: bodies[j], diff, aspect });
    }
  }
  out.sort((x, y) => x.aspect.delta - y.aspect.delta);
  return out;
}

const TONE_VERB = {
  harmonious: "clicks with surprisingly little effort",
  tense: "creates real friction — the kind that either teaches you something or wears you down",
  neutral: "sets a strong, hard-to-ignore undertone between you",
};

// Hand-written themes for the pairs that carry the most weight in synastry
// practice. Keyed "bodyA-bodyB" alphabetically; each has one line per aspect
// quality. Anything not listed here falls back to a generated line built from
// BODY_META domains, so every possible pair still gets a sentence.
const THEMES = {
  "moon-sun": {
    harmonious: "an instinctive, low-friction warmth — one of you feels *seen* by the other without having to explain",
    tense: "a basic mismatch between what one of you needs and how the other one shows up",
    neutral: "a strong emotional gravity between identity and instinct, for better and worse",
  },
  "sun-venus": {
    harmonious: "easy mutual admiration — being around each other just feels good",
    tense: "one person's self-image and the other's sense of what's lovable don't quite line up",
    neutral: "a magnetic, slightly vain undertone — you notice each other",
  },
  "mars-sun": {
    harmonious: "one of you fuels the other's confidence and drive directly",
    tense: "a competitive, ego-versus-ego edge — good for a rivalry, hard on a truce",
    neutral: "a lot of raw charge between will and identity",
  },
  "moon-venus": {
    harmonious: "affection that feels safe — the emotional and the romantic sides agree",
    tense: "one of you wants comfort, the other wants romance, and the timing rarely matches",
    neutral: "a soft, moody pull toward each other",
  },
  "mars-moon": {
    harmonious: "instinct and drive move together — action feels emotionally justified",
    tense: "one of you reacts, the other retreats, on a short fuse",
    neutral: "an intense, reactive current running under everything",
  },
  "mars-venus": {
    harmonious: "the classic attraction aspect — desire and affection reinforce each other",
    tense: "chemistry with a fight built in — a lot of heat, not always the good kind",
    neutral: "unmistakable, hard-to-ignore chemistry",
  },
  "moon-saturn": {
    harmonious: "one of you gives the other's feelings real structure and staying power",
    tense: "one of you feels judged or held at arm's length by the other, whether or not that's meant",
    neutral: "a heavy, serious weight on the emotional connection — this bond doesn't feel casual",
  },
  "saturn-sun": {
    harmonious: "one of you makes the other more disciplined and durable, in a good way",
    tense: "one person's ambitions feel restricted or tested by the other",
    neutral: "a relationship that asks to be taken seriously, whether you meant it to or not",
  },
  "mars-saturn": {
    harmonious: "drive with discipline — you get things done together",
    tense: "one of you feels braked or blocked by the other's caution",
    neutral: "friction between wanting to move and wanting to wait",
  },
  "mercury-venus": {
    harmonious: "you enjoy talking to each other — flirtation and conversation blur together",
    tense: "how one of you wants to be talked to and how the other one talks don't match",
    neutral: "a chatty, idea-driven undercurrent to the attraction",
  },
  "mercury-moon": {
    harmonious: "you can actually say the emotional stuff out loud to each other",
    tense: "feelings and words keep missing each other in translation",
    neutral: "a strong pull to narrate the relationship to each other, constantly",
  },
  "mercury-sun": {
    harmonious: "mutual interest in each other's minds — good conversational chemistry",
    tense: "one of you feels unheard or talked over by the other",
    neutral: "you think about each other a lot, and about what to say next",
  },
  "jupiter-sun": {
    harmonious: "one of you makes the other feel bigger, luckier, more themselves",
    tense: "encouragement tips into overpromising or overdoing it",
    neutral: "a big, expansive, slightly larger-than-life quality to how you see each other",
  },
  "moon-moon": {
    harmonious: "your emotional rhythms are naturally in sync",
    tense: "your moods run on incompatible clocks",
    neutral: "an unusually strong emotional entanglement — you feel each other's weather",
  },
  "sun-sun": {
    harmonious: "your core temperaments genuinely get along",
    tense: "two strong wills that don't automatically defer to each other",
    neutral: "a real clash — or a real mirror — of identities",
  },
  "venus-venus": {
    harmonious: "you want and value similar things, which makes affection easy",
    tense: "your ideas of romance and worth pull in different directions",
    neutral: "a strong, values-level pull toward (or away from) the same things",
  },
  "mars-mars": {
    harmonious: "your drives point the same direction — you want the same kind of action",
    tense: "two people used to leading, colliding over who's in charge",
    neutral: "matched intensity, which can read as chemistry or as combat depending on the day",
  },
  "asc-sun": {
    harmonious: "one of you feels immediately, easily *at home* around the other",
    tense: "first impressions keep needing to be revised, in an uneasy way",
    neutral: "a strong first-glance pull — you noticed each other fast",
  },
  "asc-moon": {
    harmonious: "one of you feels instinctively comfortable in the other's presence",
    tense: "the way one of you shows up rubs against what the other needs to feel safe",
    neutral: "a gut-level reaction to each other that's hard to explain",
  },
  "asc-venus": {
    harmonious: "one of you finds the other genuinely, easily attractive on sight",
    tense: "attraction and comfort don't automatically come as a package here",
    neutral: "a strong physical/aesthetic pull",
  },
};

function themeKey(a, b) {
  return [a, b].sort().join("-");
}

export function synastryBlurb(entry, nameA, nameB) {
  const { bodyA, bodyB, aspect } = entry;
  const key = themeKey(bodyA, bodyB);
  const theme = THEMES[key] || THEMES[themeKey(bodyB, bodyA)];
  const metaA = BODY_META[bodyA], metaB = BODY_META[bodyB];
  const lead = `${nameA}'s ${metaA.name} ${aspect.glyph} ${nameB}'s ${metaB.name}`;
  if (theme) return `${lead} — ${theme[aspect.quality]}.`;
  return `${lead} — ${metaA.domain} runs into ${metaB.domain}, and it ${TONE_VERB[aspect.quality]}.`;
}

export const ZODIAC_GLYPH = {
  Aries: "♈", Taurus: "♉", Gemini: "♊", Cancer: "♋", Leo: "♌", Virgo: "♍",
  Libra: "♎", Scorpio: "♏", Sagittarius: "♐", Capricorn: "♑", Aquarius: "♒", Pisces: "♓",
};

// Plain-ASCII fallback for contexts that draw their own glyphs onto a canvas
// (the 3D scene's label sprites) rather than letting the browser lay out
// text — a <canvas> only has the fonts the page loaded, so it can't lean on
// the browser's normal Unicode-symbol font fallback the way DOM text can.
export const ZODIAC_ABBR = {
  Aries: "Ari", Taurus: "Tau", Gemini: "Gem", Cancer: "Can", Leo: "Leo", Virgo: "Vir",
  Libra: "Lib", Scorpio: "Sco", Sagittarius: "Sgr", Capricorn: "Cap", Aquarius: "Aqu", Pisces: "Psc",
};

export { ZODIAC };
