// Two-account Markov chain generator: trains a separate order-3 word chain
// (falls back to order-2, then order-1 — the classic MegaHAL back-off, same
// trick as sites/grue/public/lib/markov.js, which this file is adapted from)
// on each of two accounts' posts, then *blends* them at generation time
// instead of just concatenating both corpora into one bag of words — at
// every step of the walk, a coin weighted by the blend slider decides which
// account's chain supplies the next-word options (falling back to the other
// account's chain, then to shorter contexts, before giving up). That means a
// single generated line can genuinely drift between two voices mid-sentence,
// which reads as more "combination" than one merged chain would.
//
// Also supports seeding the walk from a real sentence instead of a single
// word: "start with" feeds the sentence in as forward context and lets the
// chain continue past it; "end with" feeds it in as backward context and
// lets the chain generate a lead-in that walks up to it.

const BOUNDARY = null;
const SEP = "";

// Excluded only as *seeds* (not from the chain itself) — a walk starting on
// "the" or "and" produces a boring, low-signal line; the same words are
// still perfectly good mid-walk transitions.
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

// "excluding links and tags" — strip URLs and hashtags before anything is
// tokenized or trained, so the chain never learns a raw link or a #hashtag
// as a word.
export function stripLinksAndTags(text) {
  return (text || "")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/#[a-zA-Z0-9_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

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
    forward3: new Map(),
    forward2: new Map(),
    forward1: new Map(),
    backward3: new Map(),
    backward2: new Map(),
    backward1: new Map(),
    dict: new Map(), // word -> occurrence count
    lines: new Set(), // normalized training lines, so a generation can dodge an exact echo
    trainedOn: 0,
    lineWordCounts: [],
    allLowerFraction: 0,
  };
}

// Three BOUNDARY tokens of padding up front covers the order-3 context even
// on the first generated word; order-2 and order-1 just read the last two
// (or one) slots of the same padded array, so one pass builds all three maps.
function learnDirection(chain3, chain2, chain1, words) {
  const padded = [BOUNDARY, BOUNDARY, BOUNDARY, ...words, BOUNDARY];
  for (let i = 3; i < padded.length; i++) {
    const w2 = padded[i - 3], w1 = padded[i - 2], w0 = padded[i - 1], next = padded[i];
    addTo(chain3, w2 + SEP + w1 + SEP + w0, next);
    addTo(chain2, w1 + SEP + w0, next);
    addTo(chain1, w0, next);
  }
}

function learnLine(brain, words) {
  if (!words.length) return;
  for (const w of words) brain.dict.set(w, (brain.dict.get(w) || 0) + 1);
  brain.lines.add(words.join(" "));
  brain.trainedOn++;

  learnDirection(brain.forward3, brain.forward2, brain.forward1, words);
  learnDirection(brain.backward3, brain.backward2, brain.backward1, [...words].reverse());
}

// Trains one account's brain from an array of raw post texts (reposts and
// replies already excluded upstream by atproto.js). Each line is trained as
// its own bounded sequence — the chain never wanders from what looked like
// the end of one post into the start of another.
export function buildBrain(rawLines) {
  const brain = newBrain();
  let lowerCount = 0;
  for (const raw of rawLines) {
    const cleaned = stripLinksAndTags(raw);
    if (!cleaned) continue;
    if (cleaned === cleaned.toLowerCase()) lowerCount++;
    const words = tokenize(cleaned);
    learnLine(brain, words);
    if (words.length) brain.lineWordCounts.push(words.length);
  }
  brain.allLowerFraction = rawLines.length ? lowerCount / rawLines.length : 0;
  return brain;
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Picks brain A or B for one step of the walk, weighted by `bias` (0 = only
// B, 1 = only A, 0.5 = even odds).
function pickBrain(brainA, brainB, bias) {
  return Math.random() < bias ? brainA : brainB;
}

function chainsFor(brain, dir) {
  return dir === "forward"
    ? [brain.forward3, brain.forward2, brain.forward1]
    : [brain.backward3, brain.backward2, brain.backward1];
}

// Looks up next-word options for a context, trying the preferred brain's
// order-3/2/1 chains in turn, then falling back to the other brain's chains
// at the same orders — a context one account never used but the other did
// still keeps the walk going, instead of dead-ending early.
function lookupOptions(primary, secondary, dir, ctx3, ctx2, ctx1) {
  for (const brain of [primary, secondary]) {
    const [c3, c2, c1] = chainsFor(brain, dir);
    if (ctx3 != null) {
      const opts = c3.get(ctx3);
      if (opts && opts.length) return opts;
    }
  }
  for (const brain of [primary, secondary]) {
    const [, c2] = chainsFor(brain, dir);
    if (ctx2 != null) {
      const opts = c2.get(ctx2);
      if (opts && opts.length) return opts;
    }
  }
  for (const brain of [primary, secondary]) {
    const [, , c1] = chainsFor(brain, dir);
    const opts = c1.get(ctx1);
    if (opts && opts.length) return opts;
  }
  return null;
}

// Walks a blended chain forward from `initial` (an array of one or more
// starting tokens, already in the direction's own word order — reversed, for
// a backward walk) until `maxTotal` tokens or a trained boundary is hit.
// Returns the full array including `initial`; callers slice off the prefix
// they already had.
function blendedWalk(brainA, brainB, bias, dir, initial, maxTotal) {
  const out = [...initial];
  const seenContexts = new Set();
  while (out.length < maxTotal) {
    const n = out.length;
    const ctx3 = n >= 3 ? out[n - 3] + SEP + out[n - 2] + SEP + out[n - 1] : null;
    const ctx2 = n >= 2 ? out[n - 2] + SEP + out[n - 1] : null;
    const ctx1 = out[n - 1];
    if (ctx3 != null) {
      if (seenContexts.has(ctx3)) break; // a revisited 3-word context means the walk looped
      seenContexts.add(ctx3);
    }
    const primary = pickBrain(brainA, brainB, bias);
    const secondary = primary === brainA ? brainB : brainA;
    const options = lookupOptions(primary, secondary, dir, ctx3, ctx2, ctx1);
    if (!options) break;
    const next = pick(options);
    if (next === BOUNDARY) break;
    out.push(next);
  }
  return out;
}

const MAX_HALF = 34; // hard ceiling on words grown in one direction

function randomSeed(brainA, brainB, bias) {
  const candidates = [];
  for (const [w, count] of brainA.dict) {
    if (isWordToken(w) && !STOPWORDS.has(w) && count >= 2) candidates.push({ w, brain: "a" });
  }
  for (const [w, count] of brainB.dict) {
    if (isWordToken(w) && !STOPWORDS.has(w) && count >= 2) candidates.push({ w, brain: "b" });
  }
  if (!candidates.length) return null;
  // Weight which account's word pool the seed is drawn from by the same
  // slider that biases the walk, so a slider pinned to one side also starts
  // there, not just drifts there.
  const preferred = Math.random() < bias ? "a" : "b";
  const pool = candidates.filter((c) => c.brain === preferred);
  return pick(pool.length ? pool : candidates).w;
}

const TERMINAL_PUNCT = /^[.!?]$/;
const WEAK_TRAILING_PUNCT = /^[,;:&]$/;

function endsWeak(words) {
  const last = words[words.length - 1];
  return WEAK_TRAILING_PUNCT.test(last) || (isWordToken(last) && STOPWORDS.has(last));
}
function endsStrong(words) {
  return TERMINAL_PUNCT.test(words[words.length - 1]);
}

function score(brainA, brainB, words, target) {
  let s = -Math.abs(words.length - target); // closest to the target length wins
  if (words.length < 3) s -= 50;
  if (brainA.lines.has(words.join(" ")) || brainB.lines.has(words.join(" "))) s -= 100; // never just recite a real post back verbatim
  if (endsWeak(words)) s -= 6;
  if (endsStrong(words)) s += 1;
  return s;
}

function trimWeakTail(words) {
  let cut = words.length;
  while (cut > 3 && endsWeak(words.slice(0, cut))) cut--;
  return words.slice(0, cut);
}

function joinWords(words) {
  let out = "";
  for (const w of words) {
    if (out === "" || /^[.,!?;:]$/.test(w)) out += w;
    else out += " " + w;
  }
  return out;
}

function targetLength(brainA, brainB, bias) {
  const pool = [];
  for (let i = 0; i < 3; i++) {
    if (brainA.lineWordCounts.length && Math.random() < bias) pool.push(pick(brainA.lineWordCounts));
    else if (brainB.lineWordCounts.length) pool.push(pick(brainB.lineWordCounts));
  }
  if (!pool.length) return 24;
  return pick(pool);
}

function capitalizeLike(text, brainA, brainB, bias) {
  const lowerFraction = bias * brainA.allLowerFraction + (1 - bias) * brainB.allLowerFraction;
  return Math.random() < lowerFraction
    ? text
    : (text.charAt(0).toUpperCase() + text.slice(1)).replace(/\bi\b/g, "I");
}

const ATTEMPTS = 20;

// Free generation: seeds a fresh line from a random (or forced) word and
// walks it both directions, same shape as grue's generate().
function generateFree(brainA, brainB, bias, forcedSeed) {
  const target = targetLength(brainA, brainB, bias);
  let best = null;
  let bestScore = -Infinity;
  let bestSeed = null;
  for (let i = 0; i < ATTEMPTS; i++) {
    const seed = forcedSeed || randomSeed(brainA, brainB, bias);
    if (!seed) return { text: "…", seed: null };
    const half = Math.max(2, Math.min(MAX_HALF, Math.round(target / 2)));
    const forward = blendedWalk(brainA, brainB, bias, "forward", [seed], half);
    const backwardWalk = blendedWalk(brainA, brainB, bias, "backward", [seed], half);
    const before = backwardWalk.slice(1).reverse();
    const words = [...before, ...forward];
    const s = score(brainA, brainB, words, target);
    if (s > bestScore) {
      bestScore = s;
      best = words;
      bestSeed = seed;
    }
  }
  while (best.length > 1 && /^[.,!?;:&]$/.test(best[0])) best.shift();
  best = trimWeakTail(best);
  return { text: capitalizeLike(joinWords(best), brainA, brainB, bias), seed: bestSeed };
}

// Continues forward past a visitor-typed sentence: seeds the walk with the
// sentence's own last up-to-3 tokens as context (order-3 back-off still
// applies for shorter/unseen contexts), then appends only the newly
// generated words after the sentence as typed.
function generateContinuation(brainA, brainB, bias, sentence) {
  const cleaned = stripLinksAndTags(sentence);
  const tokens = tokenize(cleaned);
  const context = tokens.slice(-3);
  if (!context.length) return generateFree(brainA, brainB, bias, null);
  const target = context.length + Math.max(4, Math.round(targetLength(brainA, brainB, bias) / 2));
  let best = null;
  let bestScore = -Infinity;
  for (let i = 0; i < ATTEMPTS; i++) {
    const walked = blendedWalk(brainA, brainB, bias, "forward", context, Math.min(context.length + MAX_HALF, target));
    const added = walked.slice(context.length);
    const s = -Math.abs(added.length - (target - context.length)) + (endsStrong(walked) ? 1 : 0) - (endsWeak(walked) ? 6 : 0);
    if (s > bestScore) {
      bestScore = s;
      best = added;
    }
  }
  best = trimWeakTail(best.length ? best : [""]).filter(Boolean);
  const tail = joinWords(best);
  const text = tail ? sentence.trim() + " " + tail : sentence.trim();
  return { text, seed: null };
}

// Generates a lead-in that walks up to a visitor-typed sentence: the
// sentence's own first up-to-3 tokens, reversed, become the backward-chain
// context (backward chains are trained on reversed word order, see
// learnDirection above), and the newly generated words — reversed back into
// reading order — are prepended to the sentence as typed.
function generateLeadIn(brainA, brainB, bias, sentence) {
  const cleaned = stripLinksAndTags(sentence);
  const tokens = tokenize(cleaned);
  const history = [...tokens].reverse();
  const context = history.slice(-3);
  if (!context.length) return generateFree(brainA, brainB, bias, null);
  const target = context.length + Math.max(4, Math.round(targetLength(brainA, brainB, bias) / 2));
  let best = null;
  let bestScore = -Infinity;
  for (let i = 0; i < ATTEMPTS; i++) {
    const walked = blendedWalk(brainA, brainB, bias, "backward", context, Math.min(context.length + MAX_HALF, target));
    const added = walked.slice(context.length);
    const s = -Math.abs(added.length - (target - context.length));
    if (s > bestScore) {
      bestScore = s;
      best = added;
    }
  }
  const leadIn = joinWords([...best].reverse());
  const text = leadIn ? leadIn + " " + sentence.trim() : sentence.trim();
  return { text, seed: null };
}

// Generates a post from the blended chain. `opts`:
//   forcedSeed    — a specific word to build a free generation around
//   startSentence — continue forward past this sentence, verbatim prefix
//   endSentence   — build a lead-in that walks up to this sentence, verbatim suffix
export function generate(brainA, brainB, bias, opts) {
  opts = opts || {};
  if (opts.startSentence && opts.startSentence.trim()) {
    return generateContinuation(brainA, brainB, bias, opts.startSentence);
  }
  if (opts.endSentence && opts.endSentence.trim()) {
    return generateLeadIn(brainA, brainB, bias, opts.endSentence);
  }
  return generateFree(brainA, brainB, bias, opts.forcedSeed || null);
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
