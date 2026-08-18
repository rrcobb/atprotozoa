// A from-scratch order-3 Markov chain (falls back to order-2, then order-1,
// whenever the longer context is unseen — the classic MegaHAL back-off trick,
// otherwise a bigger order just means more dead ends), walked both forward
// and backward from a seed word, with several candidates generated and the
// most "interesting" one kept — the same core algorithm as
// sites/megahal/public/lib/megahal.js (itself a reimplementation of the
// classic MegaHAL idea), copied in and trimmed down: no reply-to-input, no
// in-session learning, no keyword extraction from a prompt. This brain only
// ever does one thing — generate a fresh line in the voice of whatever corpus
// it was trained on — so half of megahal.js's surface (built for a two-way
// chat) doesn't apply here.
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
    forward3: new Map(),
    forward2: new Map(),
    forward1: new Map(),
    backward3: new Map(),
    backward2: new Map(),
    backward1: new Map(),
    dict: new Map(), // word -> occurrence count
    lines: new Set(), // normalized training lines, so a generation can dodge an exact echo
    trainedOn: 0,
    lineWordCounts: [], // token count of each training line, sampled to size a generation
    allLowerFraction: 0, // share of training lines with no uppercase at all
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

export function buildBrain(lines) {
  const brain = newBrain();
  let lowerCount = 0;
  for (const line of lines) {
    if (line && line === line.toLowerCase()) lowerCount++;
    const words = tokenize(line);
    learnLine(brain, words);
    if (words.length) brain.lineWordCounts.push(words.length);
  }
  brain.allLowerFraction = lines.length ? lowerCount / lines.length : 0;
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

function walk(chain3, chain2, chain1, seed, maxWords) {
  const out = [seed];
  const seenContexts = new Set();
  while (out.length < maxWords) {
    let options = null;
    if (out.length >= 3) {
      const ctx = out[out.length - 3] + SEP + out[out.length - 2] + SEP + out[out.length - 1];
      if (seenContexts.has(ctx)) break;
      seenContexts.add(ctx);
      options = chain3.get(ctx);
    }
    // Back off to a shorter, more-often-seen context rather than dead-ending
    // the walk the moment the order-3 context is novel.
    if ((!options || !options.length) && out.length >= 2) {
      options = chain2.get(out[out.length - 2] + SEP + out[out.length - 1]);
    }
    if (!options || !options.length) options = chain1.get(out[out.length - 1]);
    if (!options || !options.length) break;
    const next = pick(options);
    if (next === BOUNDARY) break;
    out.push(next);
  }
  return out;
}

const MAX_HALF = 36; // hard ceiling on words grown in each direction from the seed

// Real godoglyness posts are mostly much shorter than a maxed-out walk would
// produce (median ~34 tokens, not ~65) — always favoring the longest of
// several attempts was itself a tell, so each generation targets a length
// sampled from the real corpus instead of maximizing it.
function generateOnce(brain, seed, target) {
  const half = Math.max(2, Math.min(MAX_HALF, Math.round(target / 2)));
  const forward = walk(brain.forward3, brain.forward2, brain.forward1, seed, half);
  const backwardWalk = walk(brain.backward3, brain.backward2, brain.backward1, seed, half);
  const before = backwardWalk.slice(1).reverse();
  return [...before, ...forward];
}

function score(brain, words, target) {
  let s = -Math.abs(words.length - target); // closest to the target length wins
  if (words.length < 3) s -= 50; // strongly avoid degenerate fragments
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

  const target = brain.lineWordCounts.length ? pick(brain.lineWordCounts) : 24;

  let best = null;
  let bestScore = -Infinity;
  let bestSeed = null;
  for (let i = 0; i < ATTEMPTS; i++) {
    const seed = pick(seeds);
    const words = generateOnce(brain, seed, target);
    const s = score(brain, words, target);
    if (s > bestScore) {
      bestScore = s;
      best = words;
      bestSeed = seed;
    }
  }

  while (best.length > 1 && /^[.,!?;:&]$/.test(best[0])) best.shift();
  const out = joinWords(best);
  // The chain only ever learns lowercase tokens, so "always capitalize" was
  // its own tell — real godoglyness posts run all-lowercase about a third of
  // the time. Match that rate instead of forcing title case every time.
  const text = Math.random() < brain.allLowerFraction
    ? out
    : (out.charAt(0).toUpperCase() + out.slice(1)).replace(/\bi\b/g, "I");
  return { text, seed: bestSeed };
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
