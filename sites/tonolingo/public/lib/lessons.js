// Tonolingo curriculum: pitch-contour "tones" grouped into units.
// Each item is a synthesizable contour, not an audio file:
//   contour: [[tRatio, chaoLevel], ...] piecewise-linear pitch, levels 1 (low) - 5 (high)
//   creak:   optional { from, to, depth } — a glottal-fry amplitude flutter over
//            part of the contour, used for the glottalized Vietnamese tones
//   dur:     seconds, defaults to 0.85 (shorter for the checked/abrupt tones)
// A unit unlocks the next once its lesson is passed with hearts to spare.

window.TONOLINGO_UNITS = [
  {
    id: "warmup",
    title: "Warm-Up: Shapes",
    icon: "\u{1F30A}",
    blurb: "Six abstract pitch contours before you meet a real language: rising, falling, flat, dipping, peaking.",
    items: [
      { id: "w-hiflat", label: "High, flat", sub: "steady high pitch", contour: [[0, 5], [1, 5]] },
      { id: "w-loflat", label: "Low, flat", sub: "steady low pitch", contour: [[0, 1], [1, 1]] },
      { id: "w-rising", label: "Rising", sub: "starts low, climbs high", contour: [[0, 1], [1, 5]] },
      { id: "w-falling", label: "Falling", sub: "starts high, drops low", contour: [[0, 5], [1, 1]] },
      { id: "w-dip", label: "Dipping", sub: "falls, then rises", contour: [[0, 3], [0.5, 1], [1, 4]] },
      { id: "w-peak", label: "Peaking", sub: "rises, then falls", contour: [[0, 2], [0.5, 5], [1, 2]] },
    ],
  },
  {
    id: "mandarin-bare",
    title: "Mandarin: The Four Tones",
    icon: "\u{1F40E}",
    blurb: "The four tones of Standard Mandarin, on the bare syllable ma — high-flat, rising, dipping, falling.",
    items: [
      { id: "m1", label: "Tone 1", sub: "ā — high, flat (55)", contour: [[0, 5], [1, 5]] },
      { id: "m2", label: "Tone 2", sub: "á — rising (35)", contour: [[0, 3], [1, 5]] },
      { id: "m3", label: "Tone 3", sub: "ǎ — dips then rises (214)", contour: [[0, 2], [0.5, 1], [1, 4]] },
      { id: "m4", label: "Tone 4", sub: "à — sharp fall (51)", contour: [[0, 5], [1, 1]] },
    ],
  },
  {
    id: "mandarin-pairs",
    title: "Mandarin: Minimal Pairs",
    icon: "妈",
    blurb: "Same syllable, four tones, four unrelated words: 妈 mother, 麻 hemp, 马 horse, 骂 scold.",
    items: [
      { id: "p-ma1", label: "妈 mā", sub: "mother", contour: [[0, 5], [1, 5]] },
      { id: "p-ma2", label: "麻 má", sub: "hemp", contour: [[0, 3], [1, 5]] },
      { id: "p-ma3", label: "马 mǎ", sub: "horse", contour: [[0, 2], [0.5, 1], [1, 4]] },
      { id: "p-ma4", label: "骂 mà", sub: "scold", contour: [[0, 5], [1, 1]] },
    ],
  },
  {
    id: "vietnamese",
    title: "Vietnamese: Six Tones",
    icon: "\u{1F47B}",
    blurb: "The famous six-tone “ma” set — ghost, but, cheek, tomb, horse, and rice seedling, told apart by pitch (and a bit of creak) alone.",
    items: [
      { id: "v-ngang", label: "ma — ngang", sub: "ghost · level, mid", contour: [[0, 3], [1, 3]] },
      { id: "v-huyen", label: "mà — huyền", sub: "but / which · low, falling", contour: [[0, 3], [1, 1]] },
      {
        id: "v-sac",
        label: "má — sắc",
        sub: "cheek (‘mom’, informal) · high, rising, tense",
        contour: [[0, 3], [1, 5]],
        dur: 0.6,
      },
      { id: "v-hoi", label: "mả — hỏi", sub: "grave / tomb · dips, then rises", contour: [[0, 3], [0.45, 1], [1, 2]] },
      {
        id: "v-nga",
        label: "mã — ngã",
        sub: "horse (Sino-Viet.) · rising, with a glottal break",
        contour: [[0, 3], [0.5, 4], [1, 5]],
        creak: { from: 0.35, to: 0.62, depth: 0.15 },
      },
      {
        id: "v-nang",
        label: "mạ — nặng",
        sub: "rice seedling · low, falling, glottalized, short",
        contour: [[0, 3], [1, 1]],
        dur: 0.5,
        creak: { from: 0.3, to: 1, depth: 0.35 },
      },
    ],
  },
  {
    id: "cantonese",
    title: "Cantonese: Six Tones",
    icon: "\u{1F4DC}",
    blurb: "Poem, history, try, time, market, matter — six words, one syllable ‘si’, six contours.",
    items: [
      { id: "c-si1", label: "詩 si1", sub: "poem · high, flat (55)", contour: [[0, 5], [1, 5]] },
      { id: "c-si2", label: "史 si2", sub: "history · rising (25)", contour: [[0, 2], [1, 5]] },
      { id: "c-si3", label: "試 si3", sub: "to try · mid, flat (33)", contour: [[0, 3], [1, 3]] },
      { id: "c-si4", label: "時 si4", sub: "time · low, falling (21)", contour: [[0, 2], [1, 1]] },
      { id: "c-si5", label: "市 si5", sub: "market · low, rising (13)", contour: [[0, 1], [1, 3]] },
      { id: "c-si6", label: "事 si6", sub: "matter · low, flat (22)", contour: [[0, 2], [1, 2]] },
    ],
  },
];

// The final unit pulls every real-language item into one pool (built at
// runtime in app.js, not hand-duplicated here) and plays it back faster.
window.TONOLINGO_FINAL = {
  id: "final",
  title: "Final Exam: Mixed Drill",
  icon: "\u{1F3C1}",
  blurb: "Every tone system, shuffled together, played faster. Pass this and you've got ears.",
  questionCount: 10,
  speedMul: 0.7,
  sourceUnitIds: ["mandarin-bare", "mandarin-pairs", "vietnamese", "cantonese"],
};
