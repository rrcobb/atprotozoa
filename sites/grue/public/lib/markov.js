// A from-scratch order-2 Markov chain, walked both forward and backward from
// a seed word, with several candidates generated and the most "interesting"
// one kept — the same core algorithm as sites/megahal/public/lib/megahal.js
// (itself a reimplementation of the classic MegaHAL idea), copied in and
// trimmed down: no reply-to-input, no in-session learning, no keyword
// extraction from a prompt. This brain only ever does one thing — generate a
// fresh line in the voice of whatever corpus it was trained on — so half of
// megahal.js's surface (built for a two-way chat) doesn't apply here.
//
// Each corpus line (one real post) is trained as its own bounded sequence,
// same as megahal's "you brain": the chain never wanders from what looked
// like the end of one post into the start of another.

const BOUNDARY = null;
const SEP = "";

// Excluded only as *seeds* (not from the chain itself) — a walk starting on
// "the" or "and" produces a boring, low-signal line; the same words are still
// perfectly good mid-walk transitions.
const STOPWORDS = new Set(
  (
    "a about after again all am an and any are as at back be because been " +
    "before being below between both but by can cant could did do does " +
    "doing dont down during each few for from further had has have having " +
    "he her here hers herself him himself his how i if in into is it its " +
    "itself just like me more most my myself no nor not now of off on once " +
    "only or other our ours ourselves out over own same she should so some " +
    "such than that the their theirs them themselves then there these they " +
    "this those through to too under until up very was we were what when " +
    "where which while who whom why will with would you your yours " +
    "yourself yourselves youre youve im ive youll dont didnt doesnt isnt " +
    "arent wasnt werent hasnt havent wont cant couldnt shouldnt wouldnt " +
    "yeah ok okay well um uh oh hey hi hello"
  ).split(" "),
);

function tokenize(text) {
  return (text.toLowerCase().match(/[a-z0-9']+|[.,!?;:&]/g) || []).filter(Boolean);
}

function isWordToken(w) {
  return w != null && /[a-z0-9]/.test(w);
}

function addTo(map, key, value) {
  let arr = map.get(key);
  if (!arr) map.set(key, (arr = []));
  arr.push(value);
}

function newBrain() {
  return {
    forward2: new Map(),
    forward1: new Map(),
    backward2: new Map(),
    backward1: new Map(),
    dict: new Map(), // word -> occurrence count
    lines: new Set(), // normalized training lines, so a generation can dodge an exact echo
    trainedOn: 0,
  };
}

function learnLine(brain, words) {
  if (!words.length) return;
  for (const w of words) brain.dict.set(w, (brain.dict.get(w) || 0) + 1);
  brain.lines.add(words.join(" "));
  brain.trainedOn++;

  const fwd = [BOUNDARY, BOUNDARY, ...words, BOUNDARY];
  for (let i = 2; i < fwd.length; i++) {
    const w0 = fwd[i - 2], w1 = fwd[i - 1], next = fwd[i];
    addTo(brain.forward2, w0 + SEP + w1, next);
    addTo(brain.forward1, w1, next);
  }

  const bwd = [BOUNDARY, BOUNDARY, ...[...words].reverse(), BOUNDARY];
  for (let i = 2; i < bwd.length; i++) {
    const w0 = bwd[i - 2], w1 = bwd[i - 1], next = bwd[i];
    addTo(brain.backward2, w0 + SEP + w1, next);
    addTo(brain.backward1, w1, next);
  }
}

export function buildBrain(lines) {
  const brain = newBrain();
  for (const line of lines) learnLine(brain, tokenize(line));
  return brain;
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Good seeds: known to the brain, not a stopword, seen more than once (a
// hapax legomenon tends to dead-end the walk after a word or two).
function seedCandidates(brain) {
  const out = [];
  for (const [w, count] of brain.dict) {
    if (!isWordToken(w) || STOPWORDS.has(w) || count < 2) continue;
    out.push(w);
  }
  return out;
}

function walk(chain2, chain1, seed, maxWords) {
  const out = [seed];
  const seenContexts = new Set();
  while (out.length < maxWords) {
    let options = null;
    if (out.length >= 2) {
      const ctx = out[out.length - 2] + SEP + out[out.length - 1];
      if (seenContexts.has(ctx)) break;
      seenContexts.add(ctx);
      options = chain2.get(ctx);
    }
    if (!options || !options.length) options = chain1.get(out[out.length - 1]);
    if (!options || !options.length) break;
    const next = pick(options);
    if (next === BOUNDARY) break;
    out.push(next);
  }
  return out;
}

const MAX_HALF = 34; // words grown in each direction from the seed — generous, since the real posts run long and get truncated to a grapheme budget afterward anyway

function generateOnce(brain, seed) {
  const forward = walk(brain.forward2, brain.forward1, seed, MAX_HALF);
  const backwardWalk = walk(brain.backward2, brain.backward1, seed, MAX_HALF);
  const before = backwardWalk.slice(1).reverse();
  return [...before, ...forward];
}

function score(brain, words) {
  let s = words.length;
  if (words.length < 5) s -= 20; // strongly avoid short, boring fragments
  if (brain.lines.has(words.join(" "))) s -= 100; // never just recite a real post back verbatim
  return s;
}

function joinWords(words) {
  let out = "";
  for (const w of words) {
    if (out === "" || /^[.,!?;:]$/.test(w)) out += w;
    else out += " " + w;
  }
  return out;
}

const ATTEMPTS = 20;

// Generates one fresh line from `brain`. Returns { text, seed }.
export function generate(brain) {
  const seeds = seedCandidates(brain);
  if (!seeds.length) return { text: "…", seed: null };

  let best = null;
  let bestScore = -Infinity;
  let bestSeed = null;
  for (let i = 0; i < ATTEMPTS; i++) {
    const seed = pick(seeds);
    const words = generateOnce(brain, seed);
    const s = score(brain, words);
    if (s > bestScore) {
      bestScore = s;
      best = words;
      bestSeed = seed;
    }
  }

  while (best.length > 1 && /^[.,!?;:&]$/.test(best[0])) best.shift();
  const out = joinWords(best);
  const capitalized = (out.charAt(0).toUpperCase() + out.slice(1)).replace(/\bi\b/g, "I");
  return { text: capitalized, seed: bestSeed };
}

// Trims to a grapheme budget (Bluesky's own post limit is 300) without
// cutting a word or trailing punctuation in half.
export function fitToBudget(text, max = 300) {
  const graphemes = [...text];
  if (graphemes.length <= max) return text;
  let cut = graphemes.slice(0, max - 1).join("");
  const lastBreak = Math.max(cut.lastIndexOf(" "), cut.lastIndexOf(","));
  if (lastBreak > max * 0.5) cut = cut.slice(0, lastBreak);
  return cut.replace(/[,;:&]$/, "").trimEnd() + "…";
}
