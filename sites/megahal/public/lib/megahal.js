// A from-scratch, in-browser reimplementation of the classic MegaHAL
// algorithm (Jason Hutchens, 1998; Ruby rewrite at github.com/kranzky/megahal).
// Not a port of that code — this is the same idea (a second-order Markov
// chain walked both forward and backward from a keyword pulled out of your
// input, with several candidates generated and the most "interesting" one
// kept) built independently in plain JS so it can run entirely client-side,
// no server, no Ruby.
//
// A "brain" is a trained model: two order-2 word chains (forward and
// backward, each with an order-1 fallback for when the exact 2-word context
// was never seen) plus a word-frequency dictionary used both to pick
// interesting keywords out of your input and to seed a reply when none of
// your words are known.

const BOUNDARY = null; // marks the start/end of a trained sentence
const SEP = ""; // joins a 2-word context into one map key

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

// Punctuation is split off into its own tokens (rather than stuck to the
// word before it) so the chain learns "word, then comma" as a transition in
// its own right, and so a trailing "," or "." never accidentally becomes
// part of a dictionary word or a keyword match.
function tokenize(text) {
  return (text.toLowerCase().match(/[a-z0-9']+|[.,!?;:]/g) || []).filter(Boolean);
}

function isWordToken(w) {
  return w != null && /[a-z0-9]/.test(w);
}

// Splits free text into sentence-ish chunks on . ! ? so training and
// in-session learning both produce reasonably bounded chains — an unbounded
// chain (the whole input as one "sentence") makes every reply either the
// entire thing or nothing.
export function splitSentences(text) {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
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
    sentences: new Set(), // normalized training sentences, so a reply can dodge an exact echo
  };
}

// Trains a single tokenized sentence into a brain's four chains.
function learnSentence(brain, words) {
  if (!words.length) return;
  for (const w of words) brain.dict.set(w, (brain.dict.get(w) || 0) + 1);
  brain.sentences.add(words.join(" "));

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

// Builds a fresh brain from an array of training sentences (plain strings).
export function buildBrain(lines) {
  const brain = newBrain();
  for (const line of lines) learnSentence(brain, tokenize(line));
  return brain;
}

// Folds new text into an already-built brain — this is how the bot "learns"
// from you mid-conversation, same as the original MegaHAL training as it
// chats. Session-only: nothing here is persisted, a reload starts fresh.
export function learn(brain, text) {
  for (const sentence of splitSentences(text)) learnSentence(brain, tokenize(sentence));
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Pulls candidate keywords out of user input: known-to-the-brain,
// non-stopword words, ranked rarest-first (rarer words make more
// "interesting" reply seeds, same heuristic the original MegaHAL used).
function extractKeywords(brain, text) {
  const seen = new Set();
  const words = [];
  for (const w of tokenize(text)) {
    if (!isWordToken(w) || STOPWORDS.has(w) || seen.has(w) || !brain.dict.has(w)) continue;
    seen.add(w);
    words.push(w);
  }
  words.sort((a, b) => brain.dict.get(a) - brain.dict.get(b));
  return words;
}

function walk(chain2, chain1, seed, maxWords) {
  const out = [seed];
  const seenContexts = new Set(); // a revisited 2-word context means the walk looped — stop instead of repeating
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

const MAX_HALF = 14; // words grown in each direction from the seed — bounds every walk, so generation always terminates

function generateOnce(brain, seed) {
  const forward = walk(brain.forward2, brain.forward1, seed, MAX_HALF);
  const backwardWalk = walk(brain.backward2, brain.backward1, seed, MAX_HALF);
  const before = backwardWalk.slice(1).reverse();
  return [...before, ...forward];
}

// Rarer keyword matches score higher, same "interesting reply" heuristic
// MegaHAL uses to pick among several candidate generations. Verbatim echoes
// of a trained sentence are penalized so the bot doesn't just recite you (or
// its own corpus) back.
function score(brain, words, keywords) {
  let s = 0;
  const wordSet = new Set(words);
  for (const k of keywords) {
    if (wordSet.has(k)) s += 1 / (brain.dict.get(k) || 1);
  }
  if (words.length < 3) s -= 1;
  if (brain.sentences.has(words.join(" "))) s -= 5;
  return s;
}

const ATTEMPTS = 16;

// Generates a reply to `text` from `brain`. Returns { text, seed } — `seed`
// is the keyword the reply was built around, handy for a "why did it say
// that" hint in the UI.
export function reply(brain, text) {
  if (brain.dict.size === 0) return { text: "…", seed: null };

  const keywords = extractKeywords(brain, text);
  const dictWords = [...brain.dict.keys()].filter(isWordToken);
  if (!dictWords.length) return { text: "…", seed: null };

  let best = null;
  let bestScore = -Infinity;
  let bestSeed = null;
  for (let i = 0; i < ATTEMPTS; i++) {
    const seed = keywords.length ? pick(keywords.slice(0, Math.max(3, keywords.length))) : pick(dictWords);
    const words = generateOnce(brain, seed);
    const s = score(brain, words, keywords.length ? keywords : [seed]);
    if (s > bestScore) {
      bestScore = s;
      best = words;
      bestSeed = seed;
    }
  }

  while (best.length > 1 && /^[.,!?;:]$/.test(best[0])) best.shift(); // a backward walk can wander onto a leading comma
  const out = joinWords(best);
  const capitalized = (out.charAt(0).toUpperCase() + out.slice(1)).replace(/\bi\b/g, "I");
  const punctuated = /[.!?]$/.test(capitalized) ? capitalized : capitalized + ".";
  return { text: punctuated, seed: bestSeed };
}

// Joins generated tokens back into text without a space before punctuation
// tokens ("," "." "!" "?" ";" ":"), which tokenize() split off on the way in.
function joinWords(words) {
  let out = "";
  for (const w of words) {
    if (out === "" || /^[.,!?;:]$/.test(w)) out += w;
    else out += " " + w;
  }
  return out;
}
