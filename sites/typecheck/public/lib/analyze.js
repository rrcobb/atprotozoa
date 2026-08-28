// analyze.js — the actual "science." Scores four axes (E/I, S/N, T/F, J/P)
// off word choice and posting habits across every post.text in a repo, then
// maps the four percentages onto a 4-letter type. This is a keyword/stats
// heuristic, not a real psychometric instrument or an LLM read — no model
// call, no inference, just counting — consistent with the house style used
// by sites/didscope (DID-character horoscope) and sites/logs (deterministic
// bit-reading), just wearing a personality-quiz costume instead of a zodiac
// one. Real Myers-Briggs assessments do not work like this. Neither, really,
// does this.

const LEXICON = {
  ei: {
    // toward E
    pos: [
      "we ", "us ", "y'all", "yall", "everyone", "everybody", "hang out", "hangout",
      "let's go", "lets go", "come through", "mutuals", "congrats", "congratulations",
      "welcome", "so hyped", "so excited", "love you all", "who else", "anyone else",
      "party", "meetup", "meet up", "come say hi", "reply if", "tag someone",
    ],
    // toward I
    neg: [
      "alone", "myself", "quiet", "introvert", "peace and quiet", "need a break",
      "logging off", "log off", "solitude", "just me", "headache", "overstimulated",
      "overwhelmed", "going dark", "don't feel like", "dont feel like", "staying in",
      "by myself", "keep to myself", "don't want to talk", "dont want to talk",
    ],
  },
  sn: {
    // toward N
    pos: [
      "imagine", "what if", "theory", "meaning of", "pattern", "metaphor", "philosoph",
      "abstract", "hypothetical", "someday", "the future", "vision", "concept",
      "possibilit", "symbolic", "existential", "big picture", "in theory", "conceptually",
      "what it means", "underlying",
    ],
    // toward S
    neg: [
      "today ", "yesterday", "literally just", "just did", "right now", "specifically",
      "in fact", "step by step", "exactly", "precisely", "here's the data", "screenshot",
      "receipts", "the numbers", "concrete", "actual", "just happened", "for real this time",
    ],
  },
  tf: {
    // toward F
    pos: [
      "feel", "feeling", "feelings", "love ", "hate ", " sad", "happy", "heart",
      "appreciate", "grateful", "sorry", "hug", "proud of", "so sweet", "emotional",
      "hurts", "beautiful", "precious", "means so much", "so kind", "im crying", "i'm crying",
    ],
    // toward T
    neg: [
      "therefore", "because ", "logic", "logically", "actually,", "technically",
      "is correct", "is incorrect", "is wrong", "the data", "analysis", "the argument",
      "the evidence", "objectively", "efficient", "optimal", "the math", "by definition",
      "citation needed", "source:",
    ],
  },
  jp: {
    // toward J
    pos: [
      "the plan", "planned", "schedule", "deadline", "to-do", "todo list", "organized",
      "finally finished", "shipped", "checklist", "structured", "decided", "finalized",
      "on track", "as planned", "right on schedule", "done and done", "locked in",
    ],
    // toward P
    neg: [
      "maybe i'll", "probably", "idk", "who knows", "we'll see", "well see", "random",
      "chaos", "whatever happens", "spontaneous", "winging it", "no plan", "procrastinat",
      "eventually", "someday maybe", "we'll figure it out", "well figure it out", "no idea honestly",
    ],
  },
};

const AXES = [
  { key: "ei", posLetter: "E", negLetter: "I" },
  { key: "sn", posLetter: "N", negLetter: "S" },
  { key: "tf", posLetter: "F", negLetter: "T" },
  { key: "jp", posLetter: "J", negLetter: "P" },
];

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

// posts: array of { text, createdAt } (createdAt optional ISO string).
export function analyzePosts(posts) {
  const texts = posts.map((p) => (p.text || "")).filter((t) => t.trim().length > 0);
  const n = texts.length;

  const hits = { ei: {}, sn: {}, tf: {}, jp: {} };
  let mentionCount = 0, exclaimCount = 0, digitPostCount = 0, wordCount = 0;

  for (const raw of texts) {
    const t = raw.toLowerCase();
    wordCount += (raw.match(/\S+/g) || []).length;
    mentionCount += (raw.match(/@[a-z0-9.-]+/gi) || []).length;
    exclaimCount += (raw.match(/!/g) || []).length;
    if (/\d/.test(raw)) digitPostCount++;

    for (const axis of AXES) {
      for (const kw of LEXICON[axis.key].pos) {
        if (t.includes(kw)) hits[axis.key][kw] = (hits[axis.key][kw] || 0) + 1;
      }
      for (const kw of LEXICON[axis.key].neg) {
        if (t.includes(kw)) hits[axis.key][kw] = (hits[axis.key][kw] || 0) - 1;
      }
    }
  }

  // Posting rhythm, from actual timestamps: low variance between consecutive
  // posts' gaps reads as a kept schedule (J); wildly uneven gaps read as
  // bursty and unplanned (P). A real behavioral signal, not a word list.
  let rhythmLean = 0;
  const times = posts
    .map((p) => (p.createdAt ? Date.parse(p.createdAt) : NaN))
    .filter((t) => !Number.isNaN(t))
    .sort((a, b) => a - b);
  if (times.length > 8) {
    const gaps = [];
    for (let i = 1; i < times.length; i++) gaps.push(times[i] - times[i - 1]);
    const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    if (mean > 0) {
      const variance = gaps.reduce((a, g) => a + (g - mean) ** 2, 0) / gaps.length;
      const cv = Math.sqrt(variance) / mean; // coefficient of variation
      rhythmLean = clamp(1 - cv / 3, -1, 1); // low cv -> +1 (J), high cv -> -1 (P)
    }
  }

  const perPost = (x) => (n > 0 ? x / n : 0);
  const structural = {
    ei: perPost(mentionCount) * 1.4 + perPost(exclaimCount) * 0.9,
    sn: -perPost(digitPostCount) * 0.6, // digits lean concrete/S
    tf: 0,
    jp: rhythmLean * 2.2,
  };

  const axes = {};
  const swayed = [];
  for (const axis of AXES) {
    const lexicalScore = Object.values(hits[axis.key]).reduce((a, b) => a + b, 0);
    const totalSignal = Object.values(hits[axis.key]).reduce((a, b) => a + Math.abs(b), 0);
    const lean = clamp(lexicalScore / Math.max(3, totalSignal) + structural[axis.key], -1, 1);
    let pct = clamp(Math.round(50 + lean * 45), 5, 95);
    if (pct === 50) pct = n % 2 === 0 ? 51 : 49;

    const letter = pct >= 50 ? axis.posLetter : axis.negLetter;
    axes[axis.key] = { pct, letter, posLetter: axis.posLetter, negLetter: axis.negLetter };

    const ranked = Object.entries(hits[axis.key])
      .filter(([, v]) => (pct >= 50 ? v > 0 : v < 0))
      .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
    if (ranked.length) swayed.push(ranked[0][0].trim());
  }

  const type = axes.ei.letter + axes.sn.letter + axes.tf.letter + axes.jp.letter;

  return {
    type,
    postCount: n,
    wordCount,
    axes,
    swayed: swayed.slice(0, 5),
  };
}

export const TYPES = {
  INTJ: ["The Longform Schemer", "Three quote-skeets deep into a plan nobody asked to see, and it's working."],
  INTP: ["The Reply-Draft Philosopher", "Forty-one open tabs, one unfinished argument about semantics, no plans to finish either."],
  ENTJ: ["The Thread CEO", "Numbers the thread, assigns action items, replies to their own post to keep it moving."],
  ENTP: ["The Well-Actually", "Argues both sides for fun, wins the thread, forgets what it was even about."],
  INFJ: ["The Vagueposter Oracle", "Cryptic post at 1am, eleven people in the replies asking if they're okay."],
  INFP: ["The Softlaunch Poet", "Feelings, formatted as free verse, posted, then quote-posted by someone crying."],
  ENFJ: ["The Reply-Guy Chaplain", "Shows up in everyone's mentions with exactly the right encouraging word."],
  ENFP: ["The Serial Hyper-Upper", "Five new interests this week, hyped every mutual's post, still hasn't slept."],
  ISTJ: ["The Changelog Keeper", "Posts the update, the correction, and the follow-up correction, in that order, on schedule."],
  ISFJ: ["The Quiet Mod", "Never posts drama, always the first one to check on you in the replies."],
  ESTJ: ["The Reply-Section Foreman", "Has Opinions about how this thread should be run, and will say so."],
  ESFJ: ["The Group Chat Glue", "Organizes the meetup, remembers everyone's timezone, sends the recap thread after."],
  ISTP: ["The Silent Committer", "Pushes a fix at 2am, no context, no comment, gone by morning."],
  ISFP: ["The Aesthetic Lurker", "Posts once a month. It's always beautiful. Never explains why."],
  ESTP: ["The Reply Sniper", "First to the ratio, gone before the quote-posts even start."],
  ESFP: ["The Main Character", "Every post is an event, every reply is a bit, the timeline is better with them in it."],
};
