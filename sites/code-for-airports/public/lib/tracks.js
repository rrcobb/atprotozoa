// tracks.js — the "album": four generative pieces, each an ensemble of
// independent voices built by a seeded random walk over a scale + an
// instrument palette. Same idea as Eno's Music for Airports — tape loops of
// different lengths, all in one key, left to drift in and out of phase — but
// here the "tape loops" are Web Audio envelopes and the phasing is exact
// float-second timers instead of physical tape, so it truly never repeats
// the same way twice.
//
// Each track always carries one "hum" voice: a soft, unpitched drone meant
// to read as distant terminal/HVAC/engine noise under the pitched voices —
// the "airports" half of the theme, not just the "music for" half.

import { mulberry32, hashSeed } from "./synth.js";

// A few two-octave scales, all consonant enough that any subset of notes
// played together stays pleasant — the same trick as mootdrone's shared
// pentatonic, just one per track's mood.
const SCALES = {
  // C major pentatonic, warm and open — the "big glass concourse" scale.
  concourse: [130.81, 146.83, 164.81, 196.0, 220.0, 261.63, 293.66, 329.63, 392.0, 440.0],
  // A Lydian-tinged run, brighter and a little unresolved — walking a
  // jet bridge, not quite arrived yet.
  jetbridge: [164.81, 185.0, 220.0, 246.94, 277.18, 329.63, 370.0, 440.0, 493.88, 554.37],
  // D minor pentatonic, weighted low — the low hum and stillness of
  // waiting at a carousel that hasn't started turning.
  baggage: [146.83, 174.61, 196.0, 233.08, 261.63, 293.66, 349.23, 392.0, 466.16, 523.25],
  // A whole-tone-flavored set — nothing resolves, nothing lands, the way
  // a holding pattern circles without arriving.
  holding: [174.61, 196.0, 220.0, 246.94, 277.18, 349.23, 392.0, 440.0, 493.88, 554.37],
};

export const TRACKS = [
  {
    key: "concourse",
    title: "1/1 — Concourse",
    blurb:
      "Long pads and bells under high glass — the biggest room in the piece.",
    scale: SCALES.concourse,
    instruments: ["pad", "pad", "bell", "chime"],
    voiceCount: 5,
    cycleRange: [16, 42],
    lfoRateRange: [0.03, 0.14],
    lfoDepthRange: [0.2, 0.7],
    brightnessRange: [0.25, 0.55],
    reverb: { wet: 0.4, tail: 5.5 },
  },
  {
    key: "jetbridge",
    title: "2/1 — Jet Bridge",
    blurb: "Brighter, a little unresolved — horns and vox in a narrow hall.",
    scale: SCALES.jetbridge,
    instruments: ["horn", "vox", "chime", "pad"],
    voiceCount: 5,
    cycleRange: [9, 23],
    lfoRateRange: [0.05, 0.3],
    lfoDepthRange: [0.3, 0.9],
    brightnessRange: [0.35, 0.7],
    reverb: { wet: 0.3, tail: 3.4 },
  },
  {
    key: "baggage",
    title: "1/2 — Baggage Claim",
    blurb: "Low and patient, carousel-still — pads and soft chime, waiting.",
    scale: SCALES.baggage,
    instruments: ["pad", "chime", "drumkit", "vox"],
    voiceCount: 5,
    cycleRange: [12, 30],
    lfoRateRange: [0.04, 0.18],
    lfoDepthRange: [0.2, 0.6],
    brightnessRange: [0.15, 0.4],
    reverb: { wet: 0.36, tail: 4.6 },
  },
  {
    key: "holding",
    title: "2/2 — Holding Pattern",
    blurb: "Circling, never landing — vox, bell and horn, longest drift.",
    scale: SCALES.holding,
    instruments: ["vox", "bell", "horn", "pad"],
    voiceCount: 6,
    cycleRange: [18, 48],
    lfoRateRange: [0.02, 0.1],
    lfoDepthRange: [0.25, 0.65],
    brightnessRange: [0.2, 0.5],
    reverb: { wet: 0.44, tail: 6.2 },
  },
];

// Deterministic ensemble for (track, seed): one "hum" voice + N melodic
// voices whose instrument, note, cycle length and LFO are all drawn from
// the seeded RNG — same seed always gives the same ensemble back.
export function buildEnsemble(track, seedStr) {
  const rng = mulberry32(hashSeed(`${track.key}::${seedStr}`));
  const pick = (arr) => arr[Math.floor(rng() * arr.length)];
  const range = ([lo, hi]) => lo + rng() * (hi - lo);

  const voices = [
    {
      instrument: "hum",
      note: track.scale[0],
      cycleSec: 30 + rng() * 20,
      lfoRateHz: 0.01 + rng() * 0.02,
      lfoDepth: 0.4 + rng() * 0.3,
      brightness: 0.15,
    },
  ];

  for (let i = 0; i < track.voiceCount; i++) {
    voices.push({
      instrument: pick(track.instruments),
      note: pick(track.scale),
      cycleSec: range(track.cycleRange),
      lfoRateHz: range(track.lfoRateRange),
      lfoDepth: range(track.lfoDepthRange),
      brightness: range(track.brightnessRange),
    });
  }

  return voices;
}
