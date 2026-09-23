// data.js — the phonetic inventory + the semantic system that turns a
// syllable's own articulatory features into a definition.
//
// "Every possible syllable, with a meaning" is too large a space to store as
// a lookup table (places x manners x voicing, crossed with a full vowel
// trapezoid, crossed with an optional coda — tens of thousands of legal
// combinations before nasalization even doubles the vowel side). So instead
// of writing 400 fake dictionary entries, meaning() below is a pure function
// of a syllable's own phonetic features: comprehensive because every legal
// combination produces *something*, not because every combination is
// hand-written. See meaning.js for the generator; this file is only the
// inventory tables + the word banks it draws from.

// Loosely follows the IPA pulmonic consonant chart (places as columns,
// manners as rows). A handful of cells for rarer sounds may not perfectly
// match a linguist's copy of the chart — this is a toy, not a phonetics
// textbook — but the shape (11 places x 8 manners x voicing) is the real one.
export const PLACES = [
  { id: "bilabial", label: "Bilabial" },
  { id: "labiodental", label: "Labiodental" },
  { id: "dental", label: "Dental" },
  { id: "alveolar", label: "Alveolar" },
  { id: "postalveolar", label: "Postalveolar" },
  { id: "retroflex", label: "Retroflex" },
  { id: "palatal", label: "Palatal" },
  { id: "velar", label: "Velar" },
  { id: "uvular", label: "Uvular" },
  { id: "pharyngeal", label: "Pharyngeal" },
  { id: "glottal", label: "Glottal" },
];

export const MANNERS = [
  { id: "plosive", label: "Plosive" },
  { id: "nasal", label: "Nasal" },
  { id: "trill", label: "Trill" },
  { id: "tapflap", label: "Tap / Flap" },
  { id: "fricative", label: "Fricative" },
  { id: "lateral-fricative", label: "Lateral fricative" },
  { id: "approximant", label: "Approximant" },
  { id: "lateral-approximant", label: "Lateral approximant" },
];

// [manner][place] -> { voiceless, voiced } (either may be absent — most
// nasals/trills/approximants only exist voiced in practice, ʔ only voiceless)
const C = (voiceless, voiced) => ({ voiceless: voiceless || null, voiced: voiced || null });
const BLANK = C(null, null);

export const CONSONANTS = {
  plosive: {
    bilabial: C("p", "b"), labiodental: BLANK, dental: BLANK,
    alveolar: C("t", "d"), postalveolar: BLANK, retroflex: C("ʈ", "ɖ"),
    palatal: C("c", "ɟ"), velar: C("k", "g"), uvular: C("q", "ɢ"),
    pharyngeal: BLANK, glottal: C("ʔ", null),
  },
  nasal: {
    bilabial: C(null, "m"), labiodental: C(null, "ɱ"), dental: BLANK,
    alveolar: C(null, "n"), postalveolar: BLANK, retroflex: C(null, "ɳ"),
    palatal: C(null, "ɲ"), velar: C(null, "ŋ"), uvular: C(null, "ɴ"),
    pharyngeal: BLANK, glottal: BLANK,
  },
  trill: {
    bilabial: C(null, "ʙ"), labiodental: BLANK, dental: BLANK,
    alveolar: C(null, "r"), postalveolar: BLANK, retroflex: BLANK,
    palatal: BLANK, velar: BLANK, uvular: C(null, "ʀ"),
    pharyngeal: BLANK, glottal: BLANK,
  },
  tapflap: {
    bilabial: BLANK, labiodental: C(null, "ⱱ"), dental: BLANK,
    alveolar: C(null, "ɾ"), postalveolar: BLANK, retroflex: C(null, "ɽ"),
    palatal: BLANK, velar: BLANK, uvular: BLANK,
    pharyngeal: BLANK, glottal: BLANK,
  },
  fricative: {
    bilabial: C("ɸ", "β"), labiodental: C("f", "v"), dental: C("θ", "ð"),
    alveolar: C("s", "z"), postalveolar: C("ʃ", "ʒ"), retroflex: C("ʂ", "ʐ"),
    palatal: C("ç", "ʝ"), velar: C("x", "ɣ"), uvular: C("χ", "ʁ"),
    pharyngeal: C("ħ", "ʕ"), glottal: C("h", "ɦ"),
  },
  "lateral-fricative": {
    bilabial: BLANK, labiodental: BLANK, dental: BLANK,
    alveolar: C("ɬ", "ɮ"), postalveolar: BLANK, retroflex: BLANK,
    palatal: BLANK, velar: BLANK, uvular: BLANK,
    pharyngeal: BLANK, glottal: BLANK,
  },
  approximant: {
    bilabial: BLANK, labiodental: C(null, "ʋ"), dental: BLANK,
    alveolar: C(null, "ɹ"), postalveolar: BLANK, retroflex: C(null, "ɻ"),
    palatal: C(null, "j"), velar: C(null, "ɰ"), uvular: BLANK,
    pharyngeal: BLANK, glottal: BLANK,
  },
  "lateral-approximant": {
    bilabial: BLANK, labiodental: BLANK, dental: BLANK,
    alveolar: C(null, "l"), postalveolar: BLANK, retroflex: C(null, "ɭ"),
    palatal: C(null, "ʎ"), velar: C(null, "ʟ"), uvular: BLANK,
    pharyngeal: BLANK, glottal: BLANK,
  },
};

export const HEIGHTS = [
  { id: "close", label: "Close" },
  { id: "near-close", label: "Near-close" },
  { id: "close-mid", label: "Close-mid" },
  { id: "mid", label: "Mid" },
  { id: "open-mid", label: "Open-mid" },
  { id: "near-open", label: "Near-open" },
  { id: "open", label: "Open" },
];

export const BACKNESSES = [
  { id: "front", label: "Front" },
  { id: "central", label: "Central" },
  { id: "back", label: "Back" },
];

// [height][backness] -> { unrounded, rounded }
const V = (unrounded, rounded) => ({ unrounded: unrounded || null, rounded: rounded || null });
const VBLANK = V(null, null);

export const VOWELS = {
  close: { front: V("i", "y"), central: V("ɨ", "ʉ"), back: V("ɯ", "u") },
  "near-close": { front: V("ɪ", "ʏ"), central: VBLANK, back: V(null, "ʊ") },
  "close-mid": { front: V("e", "ø"), central: V("ɘ", "ɵ"), back: V("ɤ", "o") },
  mid: { front: VBLANK, central: V("ə", null), back: VBLANK },
  "open-mid": { front: V("ɛ", "œ"), central: V("ɜ", "ɞ"), back: V("ʌ", "ɔ") },
  "near-open": { front: V("æ", null), central: V("ɐ", null), back: VBLANK },
  open: { front: V("a", "ɶ"), central: VBLANK, back: V("ɑ", "ɒ") },
};

// ---- the sound-symbolism system meaning() draws on ----
// Each syllable's definition is assembled entirely from these banks, keyed
// by the phonetic features of whatever the player clicked. Nothing here is
// per-syllable; the combinatorics come from meaning.js crossing them.

export const DOMAIN_BY_MANNER = {
  plosive: "strike", nasal: "hum", trill: "shiver", tapflap: "tap",
  fricative: "current", "lateral-fricative": "hiss",
  approximant: "drift", "lateral-approximant": "spread",
};

export const POS_BY_MANNER = {
  plosive: "n.", tapflap: "n.", trill: "n.",
  fricative: "v.", "lateral-fricative": "v.", "lateral-approximant": "v.",
  nasal: "adj.", approximant: "adj.",
};

export const PLACE_ADJ = {
  bilabial: "close", labiodental: "bitten", dental: "edged",
  alveolar: "grounded", postalveolar: "hushed", retroflex: "curled",
  palatal: "arched", velar: "backward", uvular: "deep",
  pharyngeal: "sunken", glottal: "bare",
};

export const VOICING_ADV = {
  voiceless: "sharp, sudden", voiced: "low, sustained",
};

export const HEIGHT_ADJ = {
  close: "tiny", "near-close": "slight", "close-mid": "gentle", mid: "even",
  "open-mid": "broad", "near-open": "loose", open: "vast",
};

export const BACKNESS_ADJ = {
  front: "near", central: "plain", back: "far",
};

export const ROUND_ADJ = {
  unrounded: "flat", rounded: "full",
};

export const CODA_CLAUSE_BY_MANNER = {
  plosive: "that stops abruptly", tapflap: "that flicks shut", trill: "that shudders closed",
  fricative: "that trails into static", "lateral-fricative": "that hisses out",
  "lateral-approximant": "that fans open at the end",
  nasal: "that never quite ends", approximant: "that eases off",
};

// A rough, purely cosmetic ASCII respelling so a syllable is pronounceable
// even where the IPA symbol isn't a familiar letter. Not a real
// transliteration standard — just enough to read the thing out loud.
export const ROMAN = {
  p: "p", b: "b", t: "t", d: "d", ʈ: "tr", ɖ: "dr", c: "ky", ɟ: "gy",
  k: "k", g: "g", q: "kq", ɢ: "gq", ʔ: "'",
  m: "m", ɱ: "mf", n: "n", ɳ: "nr", ɲ: "ny", ŋ: "ng", ɴ: "nq",
  ʙ: "brr", r: "r", ʀ: "rq",
  ⱱ: "vf", ɾ: "dd", ɽ: "rd",
  ɸ: "ph", β: "bh", f: "f", v: "v", θ: "th", ð: "dh", s: "s", z: "z",
  ʃ: "sh", ʒ: "zh", ʂ: "shr", ʐ: "zhr", ç: "hy", ʝ: "yh", x: "kh", ɣ: "gh",
  χ: "khq", ʁ: "rgh", ħ: "hq", ʕ: "'q", h: "h", ɦ: "hh",
  ɬ: "lh", ɮ: "dlh",
  ʋ: "vw", ɹ: "r", ɻ: "rr", j: "y", ɰ: "wg",
  l: "l", ɭ: "lr", ʎ: "ly", ʟ: "lq",
  i: "ee", y: "ue", ɨ: "i", ʉ: "iu", ɯ: "eu", u: "oo",
  ɪ: "i", ʏ: "ui", ʊ: "u",
  e: "ay", ø: "oe", ɘ: "uh", ɵ: "oh", ɤ: "eo", o: "oh",
  ə: "uh",
  ɛ: "eh", œ: "eu", ɜ: "er", ɞ: "ur", ʌ: "uh", ɔ: "aw",
  æ: "a", ɐ: "uh",
  a: "ah", ɶ: "aw", ɑ: "ah", ɒ: "oh",
};
