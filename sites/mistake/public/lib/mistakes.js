// Someone tagged @buildthis with two words: "make a mistake." Fair — here's
// a daily assignment. The mistake is seeded from today's date + whatever
// context you typed, so asking twice in one day gives the same answer — it
// only picks a new one at midnight.

// FNV-1a — small, fast, good enough for a mistake dispenser.
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
    max: 30,
    label: "harmless",
    lines: [
      "text the wrong group chat something completely fine. no one will even notice.",
      "misread a message, reply confidently, then quietly re-read it.",
      "forget why you walked into the room. classic, low stakes, forgivable.",
      "hit reply instead of reply-all. wait — no, the other way. still fine.",
      "leave a typo in a commit message that autocorrect definitely caused.",
      "confidently pronounce a word you've only ever read, in front of someone who knows better.",
      "put the milk back in the fridge for one extra day past its prime, and drink it anyway.",
      "open eleven tabs to look one thing up and close the original tab first.",
    ],
  },
  {
    max: 65,
    label: "regrettable",
    lines: [
      "send the email you've been \"proofreading\" for twenty minutes. it's fine. probably fine.",
      "reply-all to the whole company with \"thanks!\" and a screenshot you meant to crop.",
      "commit directly to main because it was \"just a small fix.\"",
      "start a sentence with \"no offense but\" in a channel that is, in fact, public.",
      "give unsolicited advice to someone who visibly did not ask for it.",
      "double-book yourself and only notice at the exact moment both things start.",
      "quote-post before reading past the first line.",
      "@ the wrong bot with a bug report that was never its bug to begin with.",
      "argue with a bot in your replies as if it will eventually concede the point.",
      "block someone, then spend the rest of the day wondering if they noticed.",
    ],
  },
  {
    max: 100,
    label: "legendary",
    lines: [
      "deploy on a friday, at 4:58pm, with no rollback plan, out of pure main-character energy.",
      "reply to the wrong thread with something meant for a very different audience.",
      "give a toast at an event you weren't asked to speak at.",
      "adopt a strong opinion about a technology you learned about four minutes ago, in a room full of its maintainers.",
      "hit \"delete branch\" with a little too much confidence.",
      "tell a long story that turns out to have no point, to a person you just met.",
      "post a hot take at 11pm that you will regret by 7am, and stand by it anyway at 7:01.",
      "confidently correct someone's grammar. it was your own typo.",
    ],
  },
];

function todayKey(date) {
  const d = date || new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

// `context` is optional free text ("something" left unspecified is fine —
// the assignment is general purpose). `date` overrides "today" for tests.
export function assign(context, date) {
  const ctx = (context && context.trim()) || "something";
  const seedStr = `${todayKey(date)}::${ctx.toLowerCase()}`;
  const rand = mulberry32(hash(seedStr));
  const severity = Math.floor(rand() * 101);
  const tier = TIERS.find((t) => severity <= t.max);
  const line = tier.lines[Math.floor(rand() * tier.lines.length)];
  return { severity, label: tier.label, line, context: ctx, day: todayKey(date) };
}
