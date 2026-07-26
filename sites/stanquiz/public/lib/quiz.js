// quiz.js — turns one Bluesky account's real public footprint (from
// subject.js) into a 20-question quiz about how well the quiz-taker
// actually knows THAT SPECIFIC PERSON: real bio text, real avatar/banner,
// real posts, real follows/followers, real account age. Every question has
// a ground-truth answer sitting in that account's live public data — the
// only invented content is a small pool of plain atproto trivia, used ONLY
// as filler if a very thin account can't supply 20 real personal ones.
// Adapted from simclustered's lib/quiz.js, which asks the same style of
// question about the quiz-taker's OWN graph instead of a fixed subject
// (copy, don't abstract).
//
// One category here — "lore" — is deliberately NOT genericizable: it's a
// hardcoded pool of real things @cee.wtf has actually said to this bot
// (see lib/lore.js), not something derived from whatever profile you plug
// in. Every other category still works for any handle; this one only
// fires for the fixed subject stanquiz is actually built about.

import { CEE_QUOTES, DECOY_QUOTES } from "./lore.js";

export const TARGET_COUNT = 20;

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function sample(arr, n) {
  return shuffle(arr).slice(0, Math.max(0, n));
}
function truncate(s, n) {
  s = s.replace(/\s+/g, " ").trim();
  return s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s;
}

// ── bucketed-estimate helpers ─────────────────────────────────────────────
const COUNT_BUCKETS = [
  { lo: 0, hi: 25, label: "0–25" },
  { lo: 26, hi: 100, label: "26–100" },
  { lo: 101, hi: 400, label: "101–400" },
  { lo: 401, hi: 1000, label: "401–1,000" },
  { lo: 1001, hi: Infinity, label: "1,000+" },
];
const AGE_BUCKETS = [
  { lo: 0, hi: 30, label: "under a month" },
  { lo: 31, hi: 182, label: "1–6 months" },
  { lo: 183, hi: 365, label: "6–12 months" },
  { lo: 366, hi: 730, label: "1–2 years" },
  { lo: 731, hi: Infinity, label: "2+ years" },
];
function bucketOf(buckets, n) {
  return buckets.find((b) => n >= b.lo && n <= b.hi) || buckets[buckets.length - 1];
}
function bucketChoiceQuestion(id, prompt, n, buckets) {
  const correct = bucketOf(buckets, n);
  const idx = buckets.indexOf(correct);
  const byDistance = buckets
    .map((b, i) => ({ b, d: Math.abs(i - idx) }))
    .filter((x) => x.b !== correct)
    .sort((x, y) => x.d - y.d)
    .map((x) => x.b);
  const opts = sample(byDistance.slice(0, 3), 2);
  const options = shuffle([correct, ...opts].map((b) => ({ label: b.label })));
  return {
    id,
    kind: "choice",
    category: "estimate",
    prompt,
    options,
    correctIndex: options.findIndex((o) => o.label === correct.label),
  };
}

// ── plain-fact filler, only used if a subject's public data is too thin ───
const FACT_FILLER = [
  {
    prompt: "What does the “AT” in AT Protocol stand for?",
    options: ["Authenticated Transfer", "Async Traffic", "Account Token", "Atproto Terminal"],
    correctIndex: 0,
  },
  {
    prompt: "What does atproto call a personal repo host?",
    options: ["PDS (Personal Data Server)", "AppView", "Relay", "Lexicon"],
    correctIndex: 0,
  },
  {
    prompt: "What's the schema language atproto record types are defined in?",
    options: ["Lexicon", "Protobuf", "GraphQL SDL", "OpenAPI"],
    correctIndex: 0,
  },
  {
    prompt: "What's the common slang for a post on Bluesky?",
    options: ["A skeet", "A blip", "A chirp", "A flap"],
    correctIndex: 0,
  },
  {
    prompt: "What does a did:plc identifier stay stable across?",
    options: ["Handle and PDS changes", "Only handle changes", "Only avatar changes", "Nothing — it's per-session"],
    correctIndex: 0,
  },
  {
    prompt: "What's the service that indexes and aggregates data for an app like the Bluesky client called?",
    options: ["An AppView", "A Relay", "A Lexicon", "A Jetstream"],
    correctIndex: 0,
  },
  {
    prompt: "What's the name for the real-time stream of every repo write across the network?",
    options: ["The firehose", "The waterfall", "The pipeline", "The tap"],
    correctIndex: 0,
  },
  {
    prompt: "What's the lighter-weight, JSON-over-websocket alternative to the raw firehose that Bluesky shipped in 2024?",
    options: ["Jetstream", "Lexicon", "Ozone", "XRPC"],
    correctIndex: 0,
  },
  {
    prompt: "What's the RPC scheme atproto services expose over HTTP called?",
    options: ["XRPC", "gRPC", "JSON-RPC", "SOAP"],
    correctIndex: 0,
  },
];

function factQuestion(id, f) {
  const correct = f.options[f.correctIndex];
  const options = shuffle(f.options.map((label) => ({ label })));
  return {
    id,
    kind: "choice",
    category: "fact",
    prompt: f.prompt,
    options,
    correctIndex: options.findIndex((o) => o.label === correct),
  };
}

// ── the real, personal question categories ────────────────────────────────

function yesnoCandidates(subject, decoyAccounts) {
  const trues = subject.moots.map((subj) => ({ subj, correctBool: true }));
  const falses = [
    ...subject.followsOnly.map((subj) => ({ subj, correctBool: false })),
    ...subject.followedByOnly.map((subj) => ({ subj, correctBool: false })),
    ...decoyAccounts.map((subj) => ({ subj, correctBool: false })),
  ];
  return { trues: shuffle(trues), falses: shuffle(falses) };
}

function yesnoQuestion(id, name, cand) {
  return {
    id,
    kind: "yesno",
    category: "moot-or-not",
    prompt: `Is this a real moot of @${name}'s — someone they follow who follows them back?`,
    subject: cand.subj,
    correctBool: cand.correctBool,
  };
}

function whichQuestion(id, name, target, decoyPool, verb) {
  const decoys = sample(
    decoyPool.filter((d) => d.did !== target.did),
    2,
  );
  if (decoys.length < 2) return null;
  const options = shuffle([target, ...decoys]);
  return {
    id,
    kind: "choice",
    category: "which",
    prompt: `Which of these three does @${name} actually ${verb}?`,
    options: options.map((o) => ({ label: o.displayName, sub: `@${o.handle}`, avatar: o.avatar })),
    correctIndex: options.findIndex((o) => o.did === target.did),
  };
}

// which of three real texts (from three different real accounts) was
// actually posted by the subject
function authorshipQuestion(id, name, realText, decoyTexts) {
  if (decoyTexts.length < 2) return null;
  const picks = sample(decoyTexts, 2);
  const options = shuffle([
    { label: truncate(realText, 130), correct: true },
    { label: truncate(picks[0], 130), correct: false },
    { label: truncate(picks[1], 130), correct: false },
  ]);
  return {
    id,
    kind: "choice",
    category: "post",
    prompt: `Which of these three posts did @${name} actually write?`,
    options: options.map((o) => ({ label: o.label })),
    correctIndex: options.findIndex((o) => o.correct),
  };
}

// which of two real, timestamped posts of the subject's own came more
// recently — a real, checkable order
function recencyQuestion(id, name, pair) {
  const [a, b] = pair;
  if (!a.createdAt || !b.createdAt || a.createdAt === b.createdAt) return null;
  const options = shuffle([a, b]);
  const aT = new Date(a.createdAt).getTime();
  const bT = new Date(b.createdAt).getTime();
  const correctText = aT > bT ? a.text : b.text;
  return {
    id,
    kind: "choice",
    category: "recency",
    prompt: `Real posts, real timestamps: which of these did @${name} post more recently?`,
    options: options.map((o) => ({ label: truncate(o.text, 130) })),
    correctIndex: options.findIndex((o) => o.text === correctText),
  };
}

// tokenize a bio into short standalone claims/phrases worth quizzing on
function bioChunks(text) {
  if (!text) return [];
  return text
    .split(/[\n,•·|]+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 3 && s.length <= 50 && /[a-z0-9]/i.test(s));
}

function bioWordQuestion(id, name, target, subjectBio, decoyChunks) {
  const lowerBio = subjectBio.toLowerCase();
  const safeDecoys = decoyChunks.filter((c) => !lowerBio.includes(c.toLowerCase()));
  const picks = sample(safeDecoys, 2);
  if (picks.length < 2) return null;
  const options = shuffle([
    { label: target, correct: true },
    { label: picks[0], correct: false },
    { label: picks[1], correct: false },
  ]);
  return {
    id,
    kind: "choice",
    category: "bio",
    prompt: `Which of these actually appears in @${name}'s Bluesky bio?`,
    options: options.map((o) => ({ label: o.label })),
    correctIndex: options.findIndex((o) => o.correct),
  };
}

// which of three real quotes is a real thing the subject actually said to
// this bot — hardcoded lore, not derived from the live profile at all
function loreQuestion(id, name, realQuote, decoyPool) {
  const picks = sample(decoyPool, 2);
  if (picks.length < 2) return null;
  const options = shuffle([
    { label: truncate(realQuote, 160), correct: true },
    { label: truncate(picks[0], 160), correct: false },
    { label: truncate(picks[1], 160), correct: false },
  ]);
  return {
    id,
    kind: "choice",
    category: "lore",
    prompt: `Which of these did @${name} actually say to buildthis?`,
    options: options.map((o) => ({ label: o.label })),
    correctIndex: options.findIndex((o) => o.correct),
  };
}

function imageGuessQuestion(id, category, prompt, realUrl, decoyUrls, shape) {
  const picks = sample(decoyUrls.filter((u) => u && u !== realUrl), 2);
  if (picks.length < 2) return null;
  const options = shuffle([
    { img: realUrl, correct: true },
    { img: picks[0], correct: false },
    { img: picks[1], correct: false },
  ]);
  return {
    id,
    kind: "image",
    category,
    shape,
    prompt,
    options: options.map((o) => ({ img: o.img })),
    correctIndex: options.findIndex((o) => o.correct),
  };
}

export async function buildQuiz(subject, name, { onStep } = {}) {
  if (onStep) onStep("writing your 20 questions…");
  const decoyAccounts = subject.decoys;

  const followPool = [...subject.moots, ...subject.followsOnly]; // real, actual follows
  const questions = [];
  let id = 0;
  const next = () => id++;

  // 1) moot-or-not, yes/no — up to 6
  const { trues, falses } = yesnoCandidates(subject, decoyAccounts);
  const yesnoWant = 6;
  const halfTrue = Math.min(trues.length, Math.ceil(yesnoWant / 2));
  const halfFalse = Math.min(falses.length, yesnoWant - halfTrue);
  const yesnoPicks = shuffle([...trues.slice(0, halfTrue), ...falses.slice(0, halfFalse)]);
  for (const c of yesnoPicks) questions.push(yesnoQuestion(next(), name, c));

  // 2) which-of-three (follow / moot) — up to 5
  const whichTargets = sample(subject.moots.length >= 3 ? subject.moots : followPool, 5);
  for (const t of whichTargets) {
    const isMoot = subject.moots.includes(t);
    const verb = isMoot ? "have as a mutual (moot)" : "follow";
    const decoyPool = isMoot
      ? [...subject.followsOnly, ...subject.followedByOnly, ...decoyAccounts]
      : [...subject.followedByOnly, ...decoyAccounts];
    const q = whichQuestion(next(), name, t, decoyPool, verb);
    if (q) questions.push(q);
    else id--;
  }

  // 3) which post is really theirs — up to 3, real text from 3 real accounts
  const realTexts = [...subject.posts.map((p) => p.text), ...(subject.pinnedText ? [subject.pinnedText] : [])];
  const decoyTexts = decoyAccounts.flatMap((d) => (d.posts || []).map((p) => p.text));
  const authorshipWant = Math.min(3, realTexts.length);
  for (const t of sample(realTexts, authorshipWant)) {
    const q = authorshipQuestion(next(), name, t, decoyTexts);
    if (q) questions.push(q);
    else id--;
  }

  // 4) recency of their own real posts — up to 3
  const postPool = shuffle(subject.posts.filter((p) => p.createdAt));
  for (let i = 0; i + 1 < postPool.length && questions.filter((q) => q.category === "recency").length < 3; i += 2) {
    const q = recencyQuestion(next(), name, [postPool[i], postPool[i + 1]]);
    if (q) questions.push(q);
    else id--;
  }

  // 5) bio-word recognition — up to 3, distinct phrases
  const decoyChunks = decoyAccounts.flatMap((d) => bioChunks(d.description));
  const bioTargets = sample(bioChunks(subject.profile.description), 3);
  for (const target of bioTargets) {
    const q = bioWordQuestion(next(), name, target, subject.profile.description, decoyChunks);
    if (q) questions.push(q);
    else id--;
  }

  // 6) avatar recognition — 1
  const avatarQ = imageGuessQuestion(
    next(),
    "avatar",
    `Which of these is actually @${name}'s avatar?`,
    subject.profile.avatar,
    decoyAccounts.map((d) => d.avatar),
    "avatar",
  );
  if (avatarQ) questions.push(avatarQ);
  else id--;

  // 7) banner recognition — 1, only if the subject actually has one
  if (subject.profile.banner) {
    const bannerQ = imageGuessQuestion(
      next(),
      "banner",
      `Which of these is actually @${name}'s profile banner?`,
      subject.profile.banner,
      decoyAccounts.map((d) => d.banner),
      "banner",
    );
    if (bannerQ) questions.push(bannerQ);
    else id--;
  }

  // 8) estimate real numbers about the subject — up to 3
  questions.push(bucketChoiceQuestion(next(), `How many followers does @${name} actually have?`, subject.profile.followersCount, COUNT_BUCKETS));
  questions.push(bucketChoiceQuestion(next(), `How many accounts does @${name} actually follow?`, subject.profile.followsCount, COUNT_BUCKETS));
  if (subject.profile.createdAt) {
    const days = Math.floor((Date.parse(new Date().toISOString()) - Date.parse(subject.profile.createdAt)) / 86400000);
    questions.push(bucketChoiceQuestion(next(), `How long has @${name} actually been on Bluesky?`, days, AGE_BUCKETS));
  }

  // 9) lore — real things @cee.wtf actually said to this bot, up to 6.
  // Only for the fixed subject this site is built about; not something a
  // "plug in any handle" version of this quiz could ever produce.
  if (name === "cee.wtf") {
    const loreWant = Math.min(6, CEE_QUOTES.length);
    for (const quote of sample(CEE_QUOTES, loreWant)) {
      const q = loreQuestion(next(), name, quote, DECOY_QUOTES);
      if (q) questions.push(q);
      else id--;
    }
  }

  // fill any shortfall (thin accounts) with plain, verifiable atproto facts
  const facts = shuffle(FACT_FILLER);
  let fi = 0;
  while (questions.length < TARGET_COUNT && fi < facts.length) {
    questions.push(factQuestion(next(), facts[fi++]));
  }

  return shuffle(questions).slice(0, TARGET_COUNT);
}

export const TIERS = [
  { min: 0, label: "total stranger", blurb: "you basically guessed your way through this — you don't actually know them." },
  { min: 20, label: "mutual in passing", blurb: "you've seen them around, but most of this was a coin flip." },
  { min: 40, label: "casual follower", blurb: "you catch the highlights but miss most of the specifics." },
  { min: 60, label: "certified moot", blurb: "you actually pay attention — real signal, a few real gaps." },
  { min: 80, label: "unhinged superfan", blurb: "you know their bio, their posts, and their graph better than most of their moots." },
];

export function tierFor(pct) {
  let t = TIERS[0];
  for (const tier of TIERS) if (pct >= tier.min) t = tier;
  return t;
}
