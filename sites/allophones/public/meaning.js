// meaning.js — turns a clicked-together syllable into IPA, a pronounceable
// respelling, and a generated dictionary definition. Pure functions of the
// syllable's own features (see data.js for why this is generated, not
// stored).
import {
  CONSONANTS, VOWELS, ROMAN,
  DOMAIN_BY_MANNER, POS_BY_MANNER, PLACE_ADJ, VOICING_ADV,
  HEIGHT_ADJ, BACKNESS_ADJ, ROUND_ADJ, CODA_CLAUSE_BY_MANNER,
} from "./data.js";

const COMBINING_TILDE = "̃";

export function consonantIPA(place, manner, voiced) {
  const cell = CONSONANTS[manner]?.[place];
  if (!cell) return null;
  return voiced ? cell.voiced : cell.voiceless;
}

// Every legal (existing) voicing for a place/manner cell, for building the
// clickable chart — a cell with only one side present is only clickable as
// that side.
export function voicingsFor(place, manner) {
  const cell = CONSONANTS[manner]?.[place];
  if (!cell) return [];
  const out = [];
  if (cell.voiceless) out.push(false);
  if (cell.voiced) out.push(true);
  return out;
}

export function vowelIPA(height, backness, rounded, nasal) {
  const cell = VOWELS[height]?.[backness];
  if (!cell) return null;
  const base = rounded ? cell.rounded : cell.unrounded;
  if (!base) return null;
  return nasal ? base + COMBINING_TILDE : base;
}

export function roundingsFor(height, backness) {
  const cell = VOWELS[height]?.[backness];
  if (!cell) return [];
  const out = [];
  if (cell.unrounded) out.push(false);
  if (cell.rounded) out.push(true);
  return out;
}

function romanize(ipaBase) {
  return ROMAN[ipaBase] || ipaBase;
}

// syllable: { onset: {place,manner,voiced}|null, nucleus: {height,backness,rounded,nasal}, coda: {place,manner,voiced}|null }
export function ipaOf(syllable) {
  const parts = [];
  if (syllable.onset) parts.push(consonantIPA(syllable.onset.place, syllable.onset.manner, syllable.onset.voiced));
  parts.push(vowelIPA(syllable.nucleus.height, syllable.nucleus.backness, syllable.nucleus.rounded, syllable.nucleus.nasal));
  if (syllable.coda) parts.push(consonantIPA(syllable.coda.place, syllable.coda.manner, syllable.coda.voiced));
  return parts.filter(Boolean).join("");
}

export function romanOf(syllable) {
  const parts = [];
  if (syllable.onset) parts.push(romanize(consonantIPA(syllable.onset.place, syllable.onset.manner, syllable.onset.voiced)));
  const vBase = vowelIPA(syllable.nucleus.height, syllable.nucleus.backness, syllable.nucleus.rounded, false);
  parts.push(romanize(vBase) + (syllable.nucleus.nasal ? "n" : ""));
  if (syllable.coda) parts.push(romanize(consonantIPA(syllable.coda.place, syllable.coda.manner, syllable.coda.voiced)));
  return parts.join("");
}

// The generated dictionary entry. Onset is optional (a vowel-initial
// syllable reads as "an open/breath ..." instead), coda is optional (adds a
// trailing clause instead of changing the core noun/verb/adjective).
export function meaning(syllable) {
  const { nucleus, onset, coda } = syllable;
  const heightAdj = HEIGHT_ADJ[nucleus.height];
  const backAdj = BACKNESS_ADJ[nucleus.backness];
  const roundAdj = ROUND_ADJ[nucleus.rounded ? "rounded" : "unrounded"];
  const nasalClause = nucleus.nasal ? ", lingering" : "";

  let pos, core;
  if (onset) {
    const domain = DOMAIN_BY_MANNER[onset.manner];
    const placeAdj = PLACE_ADJ[onset.place];
    const voicingAdv = VOICING_ADV[onset.voiced ? "voiced" : "voiceless"];
    pos = POS_BY_MANNER[onset.manner];
    core = `a ${voicingAdv} ${placeAdj} ${domain}`;
  } else {
    pos = "interj.";
    core = "an open, unstopped breath";
  }

  let def = `${pos} ${core}, ${heightAdj} and ${backAdj}-${roundAdj} in character${nasalClause}`;
  if (coda) {
    def += `, ${CODA_CLAUSE_BY_MANNER[coda.manner]}`;
  }
  return def + ".";
}

// ---- permalink encoding: one syllable -> a compact URL-safe string ----
// "_" separates onset/nucleus/coda, "." separates fields within each. Both
// are safe because no place/manner/height/backness id ever contains them —
// but several DO contain "-" ("lateral-fricative", "near-close", "close-mid",
// "open-mid", "near-open"), so the id joining multiple syllables together
// (see app.js's syncPermalink/loadFromPermalink) must NOT be "-", or it
// collides with those ids and corrupts the split. Use "~" there instead.
export function encodeSyllable(s) {
  return [
    s.onset ? `${s.onset.place}.${s.onset.manner}.${s.onset.voiced ? 1 : 0}` : "",
    `${s.nucleus.height}.${s.nucleus.backness}.${s.nucleus.rounded ? 1 : 0}.${s.nucleus.nasal ? 1 : 0}`,
    s.coda ? `${s.coda.place}.${s.coda.manner}.${s.coda.voiced ? 1 : 0}` : "",
  ].join("_");
}

export function decodeSyllable(str) {
  try {
    const [onsetStr, nucleusStr, codaStr] = str.split("_");
    const [nh, nb, nr, nn] = nucleusStr.split(".");
    const nucleus = { height: nh, backness: nb, rounded: nr === "1", nasal: nn === "1" };
    if (!vowelIPA(nucleus.height, nucleus.backness, nucleus.rounded, false)) return null;
    let onset = null;
    if (onsetStr) {
      const [op, om, ov] = onsetStr.split(".");
      if (!consonantIPA(op, om, ov === "1")) return null;
      onset = { place: op, manner: om, voiced: ov === "1" };
    }
    let coda = null;
    if (codaStr) {
      const [cp, cm, cv] = codaStr.split(".");
      if (!consonantIPA(cp, cm, cv === "1")) return null;
      coda = { place: cp, manner: cm, voiced: cv === "1" };
    }
    return { onset, nucleus, coda };
  } catch (_) {
    return null;
  }
}

// The count behind the "comprehensive" claim: every legal onset (or none) x
// every legal vowel quality x nasal-or-not x every legal coda (or none).
// Computed, not enumerated — meaning()/ipaOf() generate any one of these on
// demand rather than this list being materialized anywhere.
export function countSpace() {
  let consonants = 0;
  for (const manner of Object.keys(CONSONANTS)) {
    for (const place of Object.keys(CONSONANTS[manner])) {
      consonants += voicingsFor(place, manner).length;
    }
  }
  let vowelQualities = 0;
  for (const height of Object.keys(VOWELS)) {
    for (const backness of Object.keys(VOWELS[height])) {
      vowelQualities += roundingsFor(height, backness).length;
    }
  }
  const onsets = consonants + 1; // +1 for no onset
  const nuclei = vowelQualities * 2; // oral or nasalized
  const codas = consonants + 1; // +1 for no coda
  return { consonants, vowelQualities, onsets, nuclei, codas, total: onsets * nuclei * codas };
}
