// Maqam scale data and dumbek (iqa) rhythm patterns — pure data + math, no
// Web Audio here so it can run under node for tests as well as the browser.
//
// Maqamat are approximated in 24-tone equal temperament: each degree is a
// number of semitones (in steps of 0.5, i.e. quarter tones) above the tonic.
// This is the standard simplification for computer-generated maqam music —
// real performance practice tunes neutral seconds/thirds by ear and they
// drift by maqam and by region. Good enough for a generative drone piece,
// not a claim of authoritative tuning.
export const MAQAMAT = {
  rast: {
    name: "Rast",
    degrees: [0, 2, 3.5, 5, 7, 9, 10.5, 12],
    desc: "warm and resolved, with a neutral third that keeps it from ever landing fully major",
  },
  bayati: {
    name: "Bayati",
    degrees: [0, 1.5, 3, 5, 7, 8, 10, 12],
    desc: "the most common maqam in Arabic folk and pop — a neutral second gives it its characteristic ache",
  },
  hijaz: {
    name: "Hijaz",
    degrees: [0, 1, 4, 5, 7, 8, 10, 12],
    desc: "the augmented-second sound most Western ears code as 'Middle Eastern'",
  },
  kurd: {
    name: "Kurd",
    degrees: [0, 1, 3, 5, 7, 8, 10, 12],
    desc: "close to a Western Phrygian mode — a flat second throughout, dark and grounded",
  },
  nahawand: {
    name: "Nahawand",
    degrees: [0, 2, 3, 5, 7, 8, 11, 12],
    desc: "the closest maqam to a Western melodic minor — moody and cinematic",
  },
  ajam: {
    name: "Ajam",
    degrees: [0, 2, 4, 5, 7, 9, 11, 12],
    desc: "equivalent to a Western major scale, the brightest of this set",
  },
  saba: {
    name: "Saba",
    degrees: [0, 1.5, 3, 4, 6, 8, 10, 12],
    desc: "an unsettled, searching maqam built on a narrow, drooping second jins",
  },
};

export const MAQAM_KEYS = Object.keys(MAQAMAT);

// Dumbek (darbuka) rhythm cycles — one character per 8th-note step across a
// 4/4 bar: D = dum (low, center-skin), T = tek (sharp, rim), k = ghost tek
// (soft), . = rest. Approximate transcriptions of well-known iqa'at, not
// authoritative notation.
export const IQAAT = {
  maqsum: { name: "Maqsum", pattern: "D.T.DT..", desc: "the everyday 4/4 backing rhythm" },
  baladi: { name: "Baladi", pattern: "DD.TD.T.", desc: "heavier, earthier cousin of maqsum" },
  saidi: { name: "Saidi", pattern: "D.TD.T..", desc: "upper-Egyptian rhythm, swaps in an extra dum" },
  malfuf: { name: "Malfuf", pattern: "D.T.D.T.", desc: "brisk, evenly spaced 2/4 feel" },
};

export const IQA_KEYS = Object.keys(IQAAT);

export function freqFromSemitones(tonicHz, semitones) {
  return tonicHz * Math.pow(2, semitones / 12);
}

// degreeIndex may run outside [0, degrees.length) — octave wraps by adding
// or subtracting 12 semitones per octave, so callers can reach below the
// tonic (e.g. a pedal drone an octave down) or above the written scale.
export function degreeFreq(tonicHz, maqam, degreeIndex, octaveShift = 0) {
  const len = maqam.degrees.length - 1; // degrees[len] is the octave (12 semitones)
  const octave = octaveShift + Math.floor(degreeIndex / len);
  const idx = ((degreeIndex % len) + len) % len;
  return freqFromSemitones(tonicHz, maqam.degrees[idx] + 12 * octave);
}

export function pickKey(keys, rng = Math.random) {
  return keys[Math.floor(rng() * keys.length)];
}

// Picks a scale-degree index different from `avoid` when the maqam has more
// than one degree to choose from, so a wandering voice doesn't repeat itself
// back to back.
export function pickDegree(maqam, avoid, rng = Math.random) {
  const len = maqam.degrees.length - 1;
  if (len <= 1) return 0;
  let idx = avoid;
  while (idx === avoid) idx = Math.floor(rng() * len);
  return idx;
}
