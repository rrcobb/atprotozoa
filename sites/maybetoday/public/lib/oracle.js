// A "will it happen today?" oracle, tagged into being by a post that just
// said: "maybe it will happen today." The answer is seeded from today's
// date + your question, so asking the same thing twice today gives the same
// verdict — the oracle only changes its mind at midnight.

// FNV-1a — small, fast, good enough for a fortune-teller's dice.
function hash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// mulberry32 — deterministic PRNG from a 32-bit seed.
function mulberry32(seed) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TIERS = [
  {
    max: 15,
    label: "no",
    lines: [
      "not today. the stars are busy with someone else's plans.",
      "no — but you already suspected that, didn't you.",
      "not a chance before midnight. try again tomorrow.",
      "the oracle says no, and the oracle is rarely in a generous mood.",
      "no. put it down and come back to it another day.",
    ],
  },
  {
    max: 35,
    label: "unlikely",
    lines: [
      "unlikely, but keep your phone charged just in case.",
      "probably not — but 'probably' is doing some work in that sentence.",
      "the odds are thin. don't cancel your other plans over it.",
      "unlikely today. more likely a Thursday.",
      "not great odds, but the oracle has been wrong before.",
    ],
  },
  {
    max: 64,
    label: "maybe",
    lines: [
      "maybe. genuinely, sincerely, maybe.",
      "maybe — ask again after lunch, things shift by then.",
      "could go either way. that's the whole answer, sorry.",
      "maybe, if you don't overthink it between now and then.",
      "somewhere between yes and no, closer to a shrug.",
    ],
  },
  {
    max: 84,
    label: "likely",
    lines: [
      "likely — the day is leaning your way.",
      "probably yes, if you actually show up for it.",
      "good odds. don't jinx it by refreshing this page again.",
      "likely today, though the oracle wants credit if it lands.",
      "leaning yes. the timing is on your side.",
    ],
  },
  {
    max: 100,
    label: "yes",
    lines: [
      "yes. today's the day, so go do the thing.",
      "yes — clear skies for it, as far as the oracle can see.",
      "yes, and probably sooner than you think.",
      "yes. this is as sure as this oracle ever gets.",
      "yes. write it down so you remember the oracle called it.",
    ],
  },
];

function todayKey(date) {
  const d = date || new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

// `question` is optional free text ("it" left unspecified is fine — the
// oracle answers about "it" in general). `date` overrides "today" for tests.
export function consult(question, date) {
  const q = (question && question.trim()) || "it";
  const seedStr = `${todayKey(date)}::${q.toLowerCase()}`;
  const rand = mulberry32(hash(seedStr));
  const percent = Math.floor(rand() * 101);
  const tier = TIERS.find((t) => percent <= t.max);
  const line = tier.lines[Math.floor(rand() * tier.lines.length)];
  return { percent, label: tier.label, line, question: q, day: todayKey(date) };
}
