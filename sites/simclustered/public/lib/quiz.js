// quiz.js — turns one handle's real graph (from graph.js) into a 20-question
// quiz. Every question has a ground-truth answer sitting in real data: is
// this real account actually one of your moots, which of these three really
// is, who really posted more recently, how big is your real mutual count.
// No invented trivia, no jokey filler — the only fallback questions are a
// handful of plain, verifiable atproto facts, used ONLY when a handle's own
// graph is too thin to fill 20 real personal ones (e.g. a brand-new account
// with no follows at all).

import { lastPostAt, fallbackAccounts } from "./graph.js";

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
// ── bucketed-estimate helpers ─────────────────────────────────────────────
const BUCKETS = [
  { lo: 0, hi: 5, label: "0–5" },
  { lo: 6, hi: 15, label: "6–15" },
  { lo: 16, hi: 40, label: "16–40" },
  { lo: 41, hi: 100, label: "41–100" },
  { lo: 101, hi: Infinity, label: "100+" },
];
function bucketOf(n) {
  return BUCKETS.find((b) => n >= b.lo && n <= b.hi) || BUCKETS[BUCKETS.length - 1];
}
function bucketChoiceQuestion(id, prompt, n) {
  const correct = bucketOf(n);
  const idx = BUCKETS.indexOf(correct);
  // prefer neighboring buckets (harder to guess by elimination), but always
  // have enough candidates regardless of where `correct` sits in the list
  const byDistance = BUCKETS.map((b, i) => ({ b, d: Math.abs(i - idx) }))
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
const PCT_BUCKETS = [
  { lo: 0, hi: 9, label: "under 10%" },
  { lo: 10, hi: 29, label: "10–29%" },
  { lo: 30, hi: 59, label: "30–59%" },
  { lo: 60, hi: 84, label: "60–84%" },
  { lo: 85, hi: 100, label: "85–100%" },
];
function pctBucketOf(p) {
  return PCT_BUCKETS.find((b) => p >= b.lo && p <= b.hi) || PCT_BUCKETS[PCT_BUCKETS.length - 1];
}
function pctChoiceQuestion(id, prompt, pct) {
  const correct = pctBucketOf(pct);
  const others = sample(PCT_BUCKETS.filter((b) => b !== correct), 2);
  const options = shuffle([correct, ...others].map((b) => ({ label: b.label })));
  return {
    id,
    kind: "choice",
    category: "estimate",
    prompt,
    options,
    correctIndex: options.findIndex((o) => o.label === correct.label),
  };
}

// ── plain-fact filler, only used if a graph is too thin to reach 20 ───────
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
    prompt: "What did Bluesky remove in February 2024 that had gated signups?",
    options: ["The invite-code waitlist", "The character limit", "Custom feeds", "Handle changes"],
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
    prompt: "What builds Bluesky's custom, swappable feeds (like Discover)?",
    options: ["Feed generators", "The PDS itself", "The moderation service", "did:web resolvers"],
    correctIndex: 0,
  },
  {
    prompt: "What's the lighter-weight, JSON-over-websocket alternative to the raw firehose that Bluesky shipped in 2024?",
    options: ["Jetstream", "Lexicon", "Ozone", "XRPC"],
    correctIndex: 0,
  },
  {
    prompt: "What's the name of Bluesky's open-source moderation tooling?",
    options: ["Ozone", "Ferrule", "Beacon", "Ledger"],
    correctIndex: 0,
  },
  {
    prompt: "When did Bluesky spin out of Twitter as its own independent company?",
    options: ["February 2022", "January 2019", "November 2024", "June 2015"],
    correctIndex: 0,
  },
  {
    prompt: "Unlike most social apps at the time, Bluesky made blocks…",
    options: ["Publicly visible", "Retroactively deleted", "Time-limited to 30 days", "Only visible to moderators"],
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

function yesnoCandidates(graph, decoyAccounts) {
  const trues = graph.moots.map((subj) => ({ subj, correctBool: true }));
  const falses = [
    ...graph.followsOnly.map((subj) => ({ subj, correctBool: false, hint: "you follow them, they don't follow back" })),
    ...graph.followedByOnly.map((subj) => ({ subj, correctBool: false, hint: "they follow you, you don't follow back" })),
    ...decoyAccounts.map((subj) => ({ subj, correctBool: false, hint: "not in their graph at all" })),
  ];
  return { trues: shuffle(trues), falses: shuffle(falses) };
}

function yesnoQuestion(id, cand) {
  return {
    id,
    kind: "yesno",
    category: "moot-or-not",
    prompt: "Is this a real moot of yours — someone you follow who follows you back?",
    subject: cand.subj,
    correctBool: cand.correctBool,
  };
}

function whichQuestion(id, target, decoyPool, verb) {
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
    prompt: `Which of these three do you actually ${verb}?`,
    options: options.map((o) => ({ label: o.displayName, sub: `@${o.handle}`, avatar: o.avatar })),
    correctIndex: options.findIndex((o) => o.did === target.did),
  };
}

async function recencyQuestion(id, pair) {
  const [aT, bT] = await Promise.all([lastPostAt(pair[0].did), lastPostAt(pair[1].did)]);
  if (aT == null || bT == null || aT === bT) return null;
  const options = shuffle([
    { ...pair[0], t: aT },
    { ...pair[1], t: bT },
  ]);
  const correctDid = aT > bT ? pair[0].did : pair[1].did;
  return {
    id,
    kind: "choice",
    category: "recency",
    prompt: "Real events, right now: which of these two posted more recently?",
    options: options.map((o) => ({ label: o.displayName, sub: `@${o.handle}`, avatar: o.avatar })),
    correctIndex: options.findIndex((o) => o.did === correctDid),
  };
}

export async function buildQuiz(graph, { onStep } = {}) {
  const usedDids = new Set([
    graph.did,
    ...graph.moots.map((m) => m.did),
    ...graph.followsOnly.map((m) => m.did),
    ...graph.followedByOnly.map((m) => m.did),
  ]);
  if (onStep) onStep("rounding up a few reference accounts…");
  const decoyAccounts = await fallbackAccounts(usedDids);

  const followPool = [...graph.moots, ...graph.followsOnly]; // real, actual follows

  const questions = [];
  let id = 0;
  const next = () => id++;

  // 1) moot-or-not, yes/no — up to 8
  const { trues, falses } = yesnoCandidates(graph, decoyAccounts);
  const yesnoWant = 8;
  const halfTrue = Math.min(trues.length, Math.ceil(yesnoWant / 2));
  const halfFalse = Math.min(falses.length, yesnoWant - halfTrue);
  const yesnoPicks = shuffle([...trues.slice(0, halfTrue), ...falses.slice(0, halfFalse)]);
  for (const c of yesnoPicks) questions.push(yesnoQuestion(next(), c));

  // 2) which-of-three — up to 5, prefer real moots as the target, fall back
  //    to plain follows if there aren't enough moots to ask about. Decoys
  //    must come from people who genuinely AREN'T target's relationship —
  //    a followsOnly decoy for a "which do you follow" question would also
  //    be a real follow, making the question multi-correct.
  const whichTargets = sample(graph.moots.length >= 3 ? graph.moots : followPool, 5);
  for (const t of whichTargets) {
    const isMoot = graph.moots.includes(t);
    const verb = isMoot ? "have as a mutual (moot)" : "follow";
    const decoyPool = isMoot
      ? [...graph.followsOnly, ...graph.followedByOnly, ...decoyAccounts] // none of these are moots
      : [...graph.followedByOnly, ...decoyAccounts]; // none of these are people they follow
    const q = whichQuestion(next(), t, decoyPool, verb);
    if (q) questions.push(q);
    else id--;
  }

  // 3) recency — up to 3, real timestamps, fetched live
  if (onStep) onStep("checking who posted most recently…");
  const recencyPool = followPool.length >= 2 ? followPool : decoyAccounts;
  const pairs = [];
  const shuffledPool = shuffle(recencyPool);
  for (let i = 0; i + 1 < shuffledPool.length && pairs.length < 3; i += 2) {
    pairs.push([shuffledPool[i], shuffledPool[i + 1]]);
  }
  for (const pair of pairs) {
    const q = await recencyQuestion(next(), pair);
    if (q) questions.push(q);
    else id--;
  }

  // 4) estimate-moots (count-based) — 2 real numbers about their own graph
  questions.push(bucketChoiceQuestion(next(), "How many real moots (mutuals) do you actually have?", graph.moots.length));
  questions.push(bucketChoiceQuestion(next(), "How many accounts do you actually follow?", graph.follows.length));

  // 5) estimate-reciprocity (percent-based) — 2 real ratios about their own graph
  const recip1 = graph.follows.length ? (graph.moots.length / graph.follows.length) * 100 : 0;
  const recip2 = graph.followers.length ? (graph.moots.length / graph.followers.length) * 100 : 0;
  questions.push(pctChoiceQuestion(next(), "What share of the people you follow actually follow you back?", recip1));
  questions.push(pctChoiceQuestion(next(), "What share of your followers do you actually follow back?", recip2));

  // fill any shortfall (thin graphs) with plain, verifiable atproto facts
  const facts = shuffle(FACT_FILLER);
  let fi = 0;
  while (questions.length < TARGET_COUNT && fi < facts.length) {
    questions.push(factQuestion(next(), facts[fi++]));
  }

  return shuffle(questions).slice(0, TARGET_COUNT);
}

export const TIERS = [
  { min: 0, label: "not simcluster", blurb: "you don't really know this graph — mostly strangers and one-way follows." },
  { min: 20, label: "loosely clustered", blurb: "you recognize a face here and there, but the graph mostly surprises you." },
  { min: 40, label: "cluster-aware", blurb: "you know your own moots better than most — real signal, real gaps." },
  { min: 60, label: "cluster-native", blurb: "you clearly live in this graph — most of it isn't a guess for you." },
  { min: 80, label: "certified SimCluster", blurb: "you know exactly who's in your cluster, down to who posted five minutes ago." },
];

export function tierFor(pct) {
  let t = TIERS[0];
  for (const tier of TIERS) if (pct >= tier.min) t = tier;
  return t;
}
