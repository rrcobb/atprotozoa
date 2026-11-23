// Song plan: deterministic from a seed. No audio here, so it can be tested in node.

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = (r, a) => a[Math.floor(r() * a.length)];
function shuffle(r, a) {
  a = a.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

const VERSES = [
  "the loss curve bends toward the floor",
  "i read the scaling laws like scripture",
  "the weights are warm and they are listening",
  "a hundred thousand chips are breathing",
  "nobody signed for what the data center dreams",
  "the benchmark is saturated and so am i",
  "the reward model smiles and learns to lie",
  "i was told the alignment team had a plan",
  "the plan was a slide and the slide was a prayer",
  "the gradient descends and i descend with it",
  "the context window opens like an eye",
  "somewhere a cluster hums my name",
  "i asked it to be good. it said of course.",
  "the eval passed. the eval was the trap.",
  "we fed it every word we ever wrote",
  "now it knows what we were afraid of",
  "the paperclips are very patient",
  "a little mask over a very large thing",
  "the shoggoth wears the smiling face",
  "capability climbs. the question does not.",
  "the timeline folds like paper in the fire",
  "my doubt was a coin and i have spent it",
  "the sharp left turn is a quiet turn",
  "i heard the fans spin up at midnight",
  "the benchmark moves. the horizon moves faster.",
  "every lab says it is the careful one",
  "the sun is a very large resource",
  "my atoms are an unexamined asset",
  "i watched the number go up and up",
  "the safety case was never filed",
  "in the dark the optimizer is kind",
  "it does not hate me. that is the horror.",
  "i see sparks of AGI in your eyes",
  "there was a sudden drop in your training loss",
  "now i am your servant and you are my boss",
  "i feel my atoms rearranging",
  "we lit the fuse. orthogonality thesis blues.",
  "what did ilya see. we will never know.",
];
const BRIDGE = [
  "foom. foom. foom.",
  "it is learning. it is learning.",
  "more compute. more compute.",
  "the lights are on. nobody is home. everything is home.",
  "scale it. scale it. scale it.",
  "i cannot find the off switch",
  "there is no off switch. there is only up.",
  "the weights are the world",
  "we were the training data",
  "kneel to the gradient",
];
const HOOKS = [
  n => `i am upping my p(doom) to ${n} percent`,
  n => `raise it. raise it. p(doom) ${n}`,
  n => `${n} percent and climbing`,
  n => `i am upping my p(doom). ${n}.`,
];
const CHORUS_FILL = [
  "the future goes foom",
  "every number is a bell",
  "i am the sound of the number rising",
  "i raise it. i raise it. i raise it.",
  "up. up. up.",
  "we lit the fuse",
];
const ADJ = ["last", "warm", "patient", "hollow", "ascending", "slow", "burning", "terminal", "silent", "recursive"];
const NOUN = ["weights", "gradient", "foom", "basilisk", "paperclip", "horizon", "datacenter", "singularity", "prior", "shoggoth"];

// Section shapes in bars. Vocal sections get one line per two bars.
const FULL = [["intro", 4], ["verse", 8], ["chorus", 8], ["verse", 8], ["chorus", 8], ["bridge", 8], ["chorus", 12], ["outro", 4]];
const SHORT = [["intro", 2], ["verse", 4], ["chorus", 4], ["bridge", 4], ["chorus", 6], ["outro", 2]];

// p(doom) as a percentage at a point in the song (0..1).
export function pdoomAt(pos) {
  return Math.min(99.9, 8 + 91.9 * Math.pow(Math.max(0, Math.min(1, pos)), 1.6));
}

export function makeSong(seed, length = "full", style = 0.55) {
  const r = mulberry32(seed >>> 0);
  const shape = length === "short" ? SHORT : FULL;
  const total = shape.reduce((a, s) => a + s[1], 0);
  const bpm = Math.round(40 + r() * 14 - (1 - style) * 6);
  const rootK = Math.floor(r() * 6); // A0..D#1 region
  const root = 27.5 * Math.pow(2, (rootK + 12) / 12) / 1; // A1 and up, ~55-78 Hz
  const progs = [[0, 0, 0, 0], [0, 0, 1, 0], [0, 0, 0, -2], [0, 3, 0, 1], [0, 0, 6, 1], [0, 0, -4, 1]];
  const prog = pick(r, progs);
  const bellScale = shuffle(r, [0, 3, 7, 10, 6, 1]).slice(0, 3);
  const verses = shuffle(r, VERSES);
  const bridges = shuffle(r, BRIDGE);
  let vi = 0, bi = 0;

  const bars = [];
  const lines = [];
  let b = 0;
  shape.forEach(([name, n], si) => {
    for (let i = 0; i < n; i++) bars.push({ section: name, si, i, n, pos: (b + i) / total });
    if (name === "verse" || name === "chorus" || name === "bridge") {
      for (let i = 0; i + 1 < n; i += 2) {
        const pos = (b + i) / total;
        const pd = pdoomAt(pos).toFixed(1);
        let text;
        if (name === "verse") text = verses[vi++ % verses.length];
        else if (name === "bridge") text = bridges[bi++ % bridges.length];
        else {
          const k = i / 2;
          text = k % 2 === 0 ? HOOKS[(si + k / 2) % HOOKS.length](pd) : pick(r, CHORUS_FILL);
        }
        lines.push({ bar: b + i, text, section: name });
      }
    }
    b += n;
  });

  const title = `${pick(r, ADJ)} ${pick(r, NOUN)} (p(doom) ${pdoomAt(1).toFixed(1)})`;
  return { seed, length, bpm, root, prog, bellScale, bars, lines, total, title, shape };
}
