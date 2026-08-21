// WordSplice — splicepedia's successor, one level down. Same idea (real
// Wikipedia text, spliced by a scored beam search, never two-in-a-row from
// the same source, "show stitches" reveals the seams) but the spliced unit
// is a WORD instead of a sentence. Every word in the output is copied
// verbatim from a real, random Wikipedia article; a hand-built English
// grammar skeleton decides what part of speech goes in each slot, and the
// beam search picks which real word — from which article — fills it.
// Runs entirely client-side against Wikipedia's CORS-enabled action API,
// same as splicepedia. No backend, no persisted state.

const API = "https://en.wikipedia.org/w/api.php";
const MIN_EXTRACT_LEN = 400;
const ARTICLES_PER_BATCH = 10;
const MIN_SOURCES = 6;
const BEAM_WIDTH = 6;

// ---- Wikipedia fetch -------------------------------------------------------
// Same two-step dance as splicepedia: TextExtracts only ever returns a full
// plain-text extract for one page per request, even with a multi-title
// `titles=` list, so titles are fetched cheap in one call and full extracts
// are fetched per-page in parallel.

async function fetchRandomTitles(n) {
  const params = new URLSearchParams({
    action: "query",
    generator: "random",
    grnnamespace: "0",
    grnlimit: String(n),
    format: "json",
    origin: "*",
    formatversion: "2",
  });
  const res = await fetch(`${API}?${params.toString()}`);
  if (!res.ok) throw new Error(`Wikipedia API error ${res.status}`);
  const data = await res.json();
  return ((data.query && data.query.pages) || []).map((p) => p.title);
}

async function fetchPageFull(title) {
  const params = new URLSearchParams({
    action: "query",
    titles: title,
    prop: "extracts|categories",
    explaintext: "1",
    exsectionformat: "plain",
    cllimit: "50",
    format: "json",
    origin: "*",
    formatversion: "2",
  });
  const res = await fetch(`${API}?${params.toString()}`);
  if (!res.ok) throw new Error(`Wikipedia API error ${res.status}`);
  const data = await res.json();
  const pages = (data.query && data.query.pages) || [];
  return pages[0] || null;
}

async function fetchRandomPages(n) {
  const titles = await fetchRandomTitles(n);
  const pages = await Promise.all(titles.map((t) => fetchPageFull(t).catch(() => null)));
  return pages.filter(Boolean);
}

async function fetchPagesByTitles(titles) {
  const pages = await Promise.all(titles.map((t) => fetchPageFull(t).catch(() => null)));
  return pages.filter(Boolean);
}

// ---- text cleanup -----------------------------------------------------------

function looksLikeHeading(line) {
  if (/[.!?]["'”)]?$/.test(line)) return false;
  return line.length < 60;
}

function cleanLine(line) {
  return line.replace(/\[\d+\]/g, "").replace(/\s{2,}/g, " ").trim();
}

// ---- rough entity typing, for "ontological vandalism" ---------------------
// Same categories → type classifier as splicepedia: a word inherits its
// source article's type, and adjacent words from wildly different types get
// the same curated vandalism bonus.

const TYPE_RULES = [
  ["disease", /diseases|disorders|syndromes|infections|medical condition/i],
  ["war", /\bwars\b|battles|military conflict|campaigns/i],
  ["animal", /\bspecies\b|mammals|\bbirds\b|insects|genera|fauna|reptiles|amphibians|\bfish\b|arthropods/i],
  ["country", /\bcountries\b|sovereign states|\bnations\b/i],
  ["food", /\bfoods?\b|dishes|cuisine|beverages|cheeses|fruits|vegetables|\bsnacks?\b/i],
  ["philosophy", /philosoph/i],
  ["vehicle", /automobiles|aircraft|\bships\b|locomotives|\btrains\b|vehicles|spacecraft|motorcycles/i],
  ["religion", /religio|deities|mythology|churches|temples|scripture/i],
  ["software", /software|programming|video games|computing|operating systems|websites|applications/i],
  ["place", /\bcities\b|\btowns\b|geography|\brivers\b|mountains|populated places|villages/i],
  ["organization", /companies|organi[sz]ations|universities|corporations|record labels/i],
  ["person", /\bbirths\b|\bdeaths\b|\bpeople\b|surnames|alumni|living people/i],
  ["event", /\bevents\b|festivals|disasters|incidents/i],
  ["music", /albums|\bsongs\b|\bbands\b|musicians/i],
  ["art", /\bfilms\b|television series|paintings|artworks|novels|\bbooks\b/i],
];

const TYPE_META = {
  disease: { emoji: "\u{1F9A0}", label: "disease" },
  war: { emoji: "⚔️", label: "war" },
  animal: { emoji: "\u{1F43E}", label: "animal" },
  country: { emoji: "\u{1F30D}", label: "country" },
  food: { emoji: "\u{1F37D}️", label: "food" },
  philosophy: { emoji: "\u{1F4AD}", label: "philosophy" },
  vehicle: { emoji: "\u{1F697}", label: "vehicle" },
  religion: { emoji: "\u{1F6D5}", label: "religion" },
  software: { emoji: "\u{1F4BE}", label: "software" },
  place: { emoji: "\u{1F4CD}", label: "place" },
  organization: { emoji: "\u{1F3DB}️", label: "organization" },
  person: { emoji: "\u{1F9D1}", label: "person" },
  event: { emoji: "\u{1F4C5}", label: "event" },
  music: { emoji: "\u{1F3B5}", label: "music" },
  art: { emoji: "\u{1F3A8}", label: "art" },
  other: { emoji: "\u{1F4C4}", label: "topic" },
};

function classify(categories) {
  const text = (categories || []).map((c) => c.title || "").join(" | ");
  for (const [type, re] of TYPE_RULES) if (re.test(text)) return type;
  return "other";
}

const VANDAL_PAIRS = new Set(
  [
    ["person", "disease"],
    ["war", "animal"],
    ["country", "food"],
    ["philosophy", "vehicle"],
    ["religion", "software"],
  ].map(([a, b]) => [a, b].sort().join("|"))
);

function vandalismBonus(typeA, typeB) {
  if (typeA === typeB) return 0;
  if (typeA === "other" || typeB === "other") return 0.25;
  return VANDAL_PAIRS.has([typeA, typeB].sort().join("|")) ? 1 : 0.45;
}

// ---- word tokenizing + rough POS tagging -----------------------------------
//
// No POS tagger library ships in a static Cloudflare asset bundle, so this is
// a heuristic: a closed-class lookup for function words (determiners,
// pronouns, prepositions, conjunctions, auxiliaries) plus suffix guessing for
// open-class content words. It's wrong plenty of the time — a word forced
// into the wrong slot is half the joke, the other half is which article it
// came from.

const FUNCTION_TAGS = {
  the: "DET", a: "DET", an: "DET", this: "DET", that: "DET", these: "DET", those: "DET",
  some: "DET", any: "DET", each: "DET", every: "DET", no: "DET", another: "DET", such: "DET",
  he: "PRON", she: "PRON", it: "PRON", they: "PRON", we: "PRON", i: "PRON", you: "PRON",
  him: "PRON", her: "PRON", them: "PRON", us: "PRON", his: "PRON", its: "PRON", their: "PRON",
  our: "PRON", your: "PRON", my: "PRON", itself: "PRON", himself: "PRON", herself: "PRON",
  themselves: "PRON", who: "PRON", whom: "PRON", which: "PRON", what: "PRON",
  of: "PREP", in: "PREP", on: "PREP", at: "PREP", by: "PREP", for: "PREP", with: "PREP",
  about: "PREP", against: "PREP", between: "PREP", into: "PREP", through: "PREP",
  during: "PREP", before: "PREP", after: "PREP", above: "PREP", below: "PREP", to: "PREP",
  from: "PREP", over: "PREP", under: "PREP", since: "PREP", without: "PREP", within: "PREP",
  along: "PREP", across: "PREP", behind: "PREP", beyond: "PREP", near: "PREP", off: "PREP",
  and: "CONJ", but: "CONJ", or: "CONJ", nor: "CONJ", so: "CONJ", yet: "CONJ",
  although: "CONJ", because: "CONJ", if: "CONJ", while: "CONJ", when: "CONJ",
  though: "CONJ", unless: "CONJ", until: "CONJ", whereas: "CONJ",
  is: "AUX", was: "AUX", are: "AUX", were: "AUX", be: "AUX", been: "AUX", being: "AUX",
  has: "AUX", have: "AUX", had: "AUX", do: "AUX", does: "AUX", did: "AUX",
  will: "AUX", would: "AUX", can: "AUX", could: "AUX", shall: "AUX", should: "AUX",
  may: "AUX", might: "AUX", must: "AUX",
  not: "ADV", also: "ADV", very: "ADV", too: "ADV", then: "ADV", there: "ADV",
  here: "ADV", now: "ADV", often: "ADV", always: "ADV", never: "ADV", quite: "ADV",
  rather: "ADV", almost: "ADV", still: "ADV", later: "ADV", soon: "ADV", widely: "ADV",
};

function guessContentTag(word) {
  const w = word.toLowerCase();
  if (/ly$/.test(w) && w.length > 4) return "ADV";
  if (/(tion|sion|ment|ness|ity|ism|ance|ence|ology|graphy|ship|hood|dom)$/.test(w)) return "NOUN";
  if (/(ing|ed)$/.test(w) && w.length > 4) return "VERB";
  if (/(ive|ous|al|ic|able|ible|ary|ful|less|ent|ant)$/.test(w) && w.length > 4) return "ADJ";
  return "NOUN";
}

// sentenceStart: was this token the first word after a sentence boundary?
// Sentence-initial capitalization isn't evidence of a proper noun.
function tagToken(raw, sentenceStart) {
  const lower = raw.toLowerCase();
  if (FUNCTION_TAGS[lower]) return FUNCTION_TAGS[lower];
  if (/^[A-Z]{2,}$/.test(raw)) return "PROPN";
  if (!sentenceStart && /^[A-Z]/.test(raw)) return "PROPN";
  return guessContentTag(raw);
}

// Splits a cleaned prose line into {word, tag} tokens in reading order,
// tracking sentence boundaries (a run of ./!/? before the token) so
// sentence-initial capitals aren't mistaken for proper nouns.
function tokenizeLine(line) {
  const tokens = [];
  const re = /[A-Za-z][A-Za-z'-]*|\d+/g;
  let m;
  let sentenceStart = true;
  let lastIndex = 0;
  while ((m = re.exec(line))) {
    const between = line.slice(lastIndex, m.index);
    if (lastIndex !== 0 && /[.!?]["')]?\s*$/.test(between)) sentenceStart = true;
    if (!/^\d+$/.test(m[0])) {
      const tag = tagToken(m[0], sentenceStart);
      if (tag) tokens.push({ word: m[0], tag });
    }
    sentenceStart = false;
    lastIndex = re.lastIndex;
  }
  return tokens;
}

function tokenizePage(page) {
  const lines = (page.extract || "").split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const tokens = [];
  for (const raw of lines) {
    if (looksLikeHeading(raw)) continue;
    const line = cleanLine(raw);
    if (!line) continue;
    tokens.push(...tokenizeLine(line));
  }
  return tokens;
}

// ---- pool -------------------------------------------------------------------

const REQUIRED_TAGS = ["DET", "PRON", "PREP", "CONJ", "AUX", "ADV", "ADJ", "VERB", "NOUN", "PROPN"];
const MIN_PER_TAG = { DET: 20, PRON: 10, PREP: 20, CONJ: 8, AUX: 15, ADV: 8, ADJ: 12, VERB: 15, NOUN: 30, PROPN: 15 };

function buildPool(pages) {
  const pool = [];
  for (const page of pages || []) {
    if (!page || page.missing || !page.extract) continue;
    if (page.extract.length < MIN_EXTRACT_LEN) continue;
    const type = classify(page.categories);
    const tokens = tokenizePage(page);
    if (tokens.length < 20) continue;
    const source = {
      pageid: page.pageid,
      title: page.title,
      url: "https://en.wikipedia.org/wiki/" + encodeURIComponent(page.title.replace(/ /g, "_")),
      type,
    };
    tokens.forEach((tok, position) => {
      pool.push({ word: tok.word, tag: tok.tag, source, position, key: `${page.pageid}#${position}` });
    });
  }
  return pool;
}

function tagCounts(pool) {
  const counts = new Map();
  for (const w of pool) counts.set(w.tag, (counts.get(w.tag) || 0) + 1);
  return counts;
}

function meetsThresholds(pool) {
  const counts = tagCounts(pool);
  return REQUIRED_TAGS.every((tag) => (counts.get(tag) || 0) >= MIN_PER_TAG[tag]);
}

function poolByTag(pool) {
  const map = new Map();
  for (const w of pool) {
    if (!map.has(w.tag)) map.set(w.tag, []);
    map.get(w.tag).push(w);
  }
  return map;
}

async function gatherPool() {
  let pool = buildPool(await fetchRandomPages(ARTICLES_PER_BATCH));
  let attempts = 0;
  const uniqueSources = () => new Set(pool.map((w) => w.source.pageid)).size;
  while ((!meetsThresholds(pool) || uniqueSources() < MIN_SOURCES) && attempts < 5) {
    attempts++;
    pool = pool.concat(buildPool(await fetchRandomPages(ARTICLES_PER_BATCH)));
  }
  return pool;
}

// ---- transition scoring ------------------------------------------------------
//
// "Similarity around 0.4-0.6 should often beat 0 or 1" carries over from
// splicepedia as a bell curve, just applied to word-form length similarity
// instead of sentence-level lexical overlap — a single word doesn't have a
// bag of words to compare, so the "semantic similarity" and "lexical
// overlap" dimensions collapse into one orthographic-form heuristic here.
// Ontological vandalism (source-article type mismatch) and socket words
// (function words that grammatically attach to almost anything) carry over
// unchanged; "grammatical continuity" becomes a small hand-authored table of
// which part-of-speech plausibly follows which — real English grammar rules,
// not a trained/probabilistic Markov model of word sequences.

function bellOverlap(j) {
  return Math.max(0, 1 - Math.abs(j - 0.5) * 2);
}

const SOCKET_TAGS = new Set(["DET", "PRON", "PREP", "CONJ", "AUX"]);

const POS_BIGRAM_BONUS = {
  "DET|NOUN": 0.3, "DET|ADJ": 0.3, "DET|PROPN": 0.25,
  "ADJ|NOUN": 0.35, "ADJ|ADJ": 0.1, "ADJ|PROPN": 0.2,
  "PREP|DET": 0.3, "PREP|NOUN": 0.15, "PREP|PROPN": 0.2, "PREP|PRON": 0.1,
  "AUX|VERB": 0.3, "AUX|ADJ": 0.25, "AUX|DET": 0.15, "AUX|ADV": 0.2,
  "PRON|AUX": 0.3, "PRON|VERB": 0.25,
  "NOUN|AUX": 0.25, "NOUN|VERB": 0.2, "NOUN|PREP": 0.2, "NOUN|CONJ": 0.15,
  "PROPN|AUX": 0.25, "PROPN|VERB": 0.2, "PROPN|PREP": 0.15,
  "VERB|DET": 0.25, "VERB|PREP": 0.2, "VERB|ADV": 0.15, "VERB|PROPN": 0.15,
  "CONJ|DET": 0.2, "CONJ|PRON": 0.2, "CONJ|NOUN": 0.15, "CONJ|AUX": 0.15, "CONJ|PROPN": 0.15,
  "ADV|VERB": 0.2, "ADV|ADJ": 0.2, "ADV|AUX": 0.1,
};
const MAX_GRAMMAR_BONUS = Math.max(...Object.values(POS_BIGRAM_BONUS));

function grammarScore(prevTag, nextTag) {
  return POS_BIGRAM_BONUS[`${prevTag}|${nextTag}`] || 0.05;
}

function alliterates(a, b) {
  const fa = (a[0] || "").toLowerCase();
  const fb = (b[0] || "").toLowerCase();
  return !!fa && fa === fb;
}

function lengthBell(a, b) {
  const sim = 1 - Math.abs(a.length - b.length) / Math.max(a.length, b.length, 1);
  return bellOverlap(sim);
}

// fluency: does this word plausibly follow the last one, grammatically and
// in form. surprise: how far the ontological ground shifted underneath it.
// Never-same-source-consecutive is a hard constraint on candidates (enforced
// in buildArticle), so "source distance" is always satisfied within a valid
// transition, same structure as splicepedia.
const MAX_TRANSITION = 1.4 + MAX_GRAMMAR_BONUS * 2.0 + 0.6 + 0.4 + 1.4 + 0.5;

function scoreTransition(prev, cand) {
  const socket = SOCKET_TAGS.has(cand.tag);
  const grammar = grammarScore(prev.tag, cand.tag);
  const lenBell = lengthBell(prev.word, cand.word);
  const entity = prev.tag === "PROPN" && cand.tag === "PROPN";
  const vandal = vandalismBonus(prev.source.type, cand.source.type);
  const allit = alliterates(prev.word, cand.word);

  const fluency = (socket ? 1 : 0) * 1.4 + grammar * 2.0 + lenBell * 0.6 + (entity ? 0.4 : 0);
  const surprise = vandal * 1.4 + (allit ? 0.5 : 0);
  const total = fluency + surprise;

  return {
    total,
    normalized: Math.max(0, Math.min(100, Math.round((total / MAX_TRANSITION) * 100))),
    socket,
    grammar,
    entity,
    vandal,
    allit,
    fromType: prev.source.type,
    toType: cand.source.type,
  };
}

// ---- grammar skeletons + beam search -----------------------------------------
//
// A hand-built set of POS-tag templates stands in for "the grammar rules
// still work" — each slot demands a part of speech, and the beam search
// picks which real word (from which article) best fills it, optimizing
// fluency x surprise x source distance across the whole sequence, exactly
// like splicepedia's beam search over sentences.

const TEMPLATES = [
  ["DET", "NOUN", "AUX", "ADJ", "PREP", "DET", "NOUN"],
  ["DET", "PROPN", "VERB", "DET", "NOUN", "CONJ", "PRON", "VERB", "ADV"],
  ["PREP", "DET", "ADJ", "NOUN", "CONJ", "DET", "NOUN", "AUX", "VERB"],
  ["PRON", "AUX", "ADV", "VERB", "PREP", "DET", "PROPN"],
  ["DET", "NOUN", "PREP", "DET", "PROPN", "AUX", "DET", "ADJ", "NOUN"],
  ["CONJ", "DET", "NOUN", "VERB", "DET", "PROPN", "PREP", "DET", "NOUN"],
  ["DET", "ADJ", "NOUN", "AUX", "DET", "NOUN", "PREP", "DET", "PROPN"],
  ["PROPN", "VERB", "DET", "ADJ", "NOUN", "CONJ", "AUX", "ADV", "VERB"],
  ["PRON", "VERB", "PREP", "DET", "NOUN", "AUX", "ADJ"],
  ["DET", "NOUN", "CONJ", "DET", "PROPN", "AUX", "ADV", "ADJ"],
];

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickTemplates() {
  const n = 3 + Math.floor(Math.random() * 2); // 3-4 fake sentences
  return shuffle(TEMPLATES).slice(0, n);
}

// Beams never reuse a source article on consecutive words (hard constraint)
// and are penalized, not blocked, for reusing a source further back — same
// tradeoff splicepedia makes so two mutually-similar sources don't just loop
// the whole beam back and forth between themselves.
function buildArticle(pool, templates) {
  const byTag = poolByTag(pool);
  const slots = [];
  templates.forEach((tmpl, si) => tmpl.forEach((tag, ti) => slots.push({ tag, sentenceIndex: si, isFirst: ti === 0 })));

  const candidates0 = byTag.get(slots[0].tag) || [];
  if (!candidates0.length) return null;
  const seeds = shuffle(candidates0).slice(0, BEAM_WIDTH);
  let beams = seeds.map((w) => ({
    words: [w],
    transitions: [null],
    usedKeys: new Set([w.key]),
    sourceCounts: new Map([[w.source.pageid, 1]]),
    score: 0,
  }));

  for (let i = 1; i < slots.length; i++) {
    const cands = byTag.get(slots[i].tag) || [];
    const next = [];
    for (const beam of beams) {
      const last = beam.words[beam.words.length - 1];
      for (const cand of cands) {
        if (cand.source.pageid === last.source.pageid) continue; // never two in a row from the same source
        if (beam.usedKeys.has(cand.key)) continue;
        const t = scoreTransition(last, cand);
        const priorUses = beam.sourceCounts.get(cand.source.pageid) || 0;
        const repeatPenalty = priorUses * 0.5;
        const sourceCounts = new Map(beam.sourceCounts);
        sourceCounts.set(cand.source.pageid, priorUses + 1);
        next.push({
          words: beam.words.concat(cand),
          transitions: beam.transitions.concat(t),
          usedKeys: new Set(beam.usedKeys).add(cand.key),
          sourceCounts,
          score: beam.score + t.total - repeatPenalty,
        });
      }
    }
    if (!next.length) break; // every beam is stuck; ship what we have
    next.sort((a, b) => b.score - a.score);
    beams = next.slice(0, BEAM_WIDTH);
  }

  beams.sort((a, b) => {
    const ua = new Set(a.words.map((w) => w.source.pageid)).size;
    const ub = new Set(b.words.map((w) => w.source.pageid)).size;
    return b.score + ub * 0.3 - (a.score + ua * 0.3);
  });
  const best = beams[0];
  return { beam: best, slots: slots.slice(0, best.words.length) };
}

// ---- permalink: encode/decode which exact words were used -------------------
//
// Lives in the path (/a/<state>), not a #hash: a fragment never reaches the
// server, so a Worker can't tell splices apart to stamp per-result OG tags —
// every share would unfurl as the same generic card forever (see
// notes/45-sharing-and-virality.md, tier 4, and splicepedia/src/index.ts,
// which hit and fixed this same gap first). src/index.ts decodes this same
// state server-side to personalize the title/description before serving.

function b64urlEncode(str) {
  return btoa(unescape(encodeURIComponent(str)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function b64urlDecode(str) {
  let s = str.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  return decodeURIComponent(escape(atob(s)));
}

function encodeState(templates, beam) {
  const compact = { t: templates, w: beam.words.map((w) => [w.source.title, w.position]) };
  return b64urlEncode(JSON.stringify(compact));
}

function decodePath() {
  const m = /^\/a\/([A-Za-z0-9\-_]+)\/?$/.exec(location.pathname);
  if (!m) return null;
  try {
    const compact = JSON.parse(b64urlDecode(m[1]));
    if (!compact || !Array.isArray(compact.t) || !Array.isArray(compact.w) || !compact.w.length) return null;
    return compact;
  } catch {
    return null;
  }
}

async function reconstructFromCompact(compact) {
  const titles = [...new Set(compact.w.map(([t]) => t))];
  const pages = await fetchPagesByTitles(titles);
  const byTitle = new Map();
  for (const p of pages) if (p && !p.missing && p.extract) byTitle.set(p.title, p);

  const tokenCache = new Map();
  const words = [];
  for (const [title, position] of compact.w) {
    const page = byTitle.get(title);
    if (!page) throw new Error(`"${title}" is gone from Wikipedia now.`);
    if (!tokenCache.has(title)) tokenCache.set(title, tokenizePage(page));
    const tok = tokenCache.get(title)[position];
    if (!tok) throw new Error(`"${title}" has been edited since this splice was made.`);
    const source = {
      pageid: page.pageid,
      title: page.title,
      url: "https://en.wikipedia.org/wiki/" + encodeURIComponent(page.title.replace(/ /g, "_")),
      type: classify(page.categories),
    };
    words.push({ word: tok.word, tag: tok.tag, source, position, key: `${page.pageid}#${position}` });
  }

  const templates = compact.t;
  const slots = [];
  templates.forEach((tmpl, si) => tmpl.forEach((tag, ti) => slots.push({ tag, sentenceIndex: si, isFirst: ti === 0 })));

  const transitions = [null];
  for (let i = 1; i < words.length; i++) transitions.push(scoreTransition(words[i - 1], words[i]));
  return { words, transitions, slots: slots.slice(0, words.length) };
}

// ---- rendering ---------------------------------------------------------

const els = {
  headline: document.getElementById("headline"),
  status: document.getElementById("status"),
  article: document.getElementById("article"),
  infobox: document.getElementById("infobox"),
  infoboxTitle: document.getElementById("infobox-title"),
  infoboxBody: document.getElementById("infobox-body"),
  stitchNotes: document.getElementById("stitch-notes"),
  btnRandomize: document.getElementById("btn-randomize"),
  btnStitches: document.getElementById("btn-stitches"),
  btnShare: document.getElementById("btn-share"),
  btnPermalink: document.getElementById("btn-permalink"),
  toast: document.getElementById("copied-toast"),
};

let current = null; // last rendered { words, transitions, slots }
let stitchesOn = false;

function setStatus(msg, isError) {
  els.status.textContent = msg || "";
  els.status.classList.toggle("error", !!isError);
}

function setBusy(busy) {
  els.btnRandomize.disabled = busy;
}

function bucketOf(norm) {
  if (norm >= 70) return "score-high";
  if (norm >= 40) return "score-mid";
  return "score-low";
}

function escapeHtml(s) {
  return (s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function capitalize(w) {
  return w ? w[0].toUpperCase() + w.slice(1) : w;
}

function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

// Cut-and-paste ransom-note look: every word gets a stable (hashed, not
// random-per-render) rotation, "paper" tone, and font, as if clipped from a
// different page and glued down — which, in a sense, it was.
const CLIP_FONTS = [
  "Georgia, serif",
  "'Courier New', monospace",
  "'Trebuchet MS', sans-serif",
  "Impact, Charcoal, sans-serif",
  "'Times New Roman', serif",
  "Verdana, sans-serif",
];

function wordSpan(w, i, t) {
  const angle = (hashStr(w.key) % 13) - 6;
  const font = CLIP_FONTS[hashStr(w.key + "f") % CLIP_FONTS.length];
  const paper = hashStr(w.key + "p") % 3;
  const norm = t ? t.normalized : null;
  const cls = t ? bucketOf(norm) : "score-mid";
  const display = w.isSentenceStart ? capitalize(w.word) : w.word;
  return (
    `<span class="w paper-${paper} ${cls}" data-i="${i}" style="--rot:${angle}deg; font-family:${font};">${escapeHtml(display)}</span>` +
    `<sup class="stitch-mark ${cls}" data-i="${i}"><a href="#note-${i}" title="source: ${escapeHtml(w.source.title)}">[${i + 1}]</a></sup>`
  );
}

function renderResult(result) {
  current = result;
  const { words, transitions, slots } = result;
  const sourceSet = new Set(words.map((w) => w.source.pageid));

  els.headline.textContent = `A ${words.length}-word ransom note stitched from ${sourceSet.size} Wikipedia articles`;
  document.title = "WordSplice — a Wikipedia ransom note";

  const sentences = [];
  let cur = [];
  let curIdx = -1;
  words.forEach((w, i) => {
    if (slots[i].sentenceIndex !== curIdx) {
      if (cur.length) sentences.push(cur);
      cur = [];
      curIdx = slots[i].sentenceIndex;
    }
    cur.push(i);
  });
  if (cur.length) sentences.push(cur);

  const paraHtml = sentences
    .map((idxs) => {
      let html = "";
      idxs.forEach((i, j) => {
        const w = { ...words[i], isSentenceStart: slots[i].isFirst };
        const t = transitions[i];
        const sep = j === 0 ? "" : w.tag === "CONJ" ? ", " : " ";
        html += sep + wordSpan(w, i, t);
      });
      return `<p>${html}.</p>`;
    })
    .join("\n");
  els.article.innerHTML = paraHtml;
  els.article.hidden = false;

  renderInfobox(result, sourceSet);
  renderStitchNotes(result);

  els.btnStitches.disabled = false;
  els.btnShare.disabled = false;
  els.btnPermalink.disabled = false;
  applyStitchState();
}

function renderInfobox(result, sourceSet) {
  const { words, transitions } = result;
  const scored = transitions.filter(Boolean);
  const avg = scored.length ? Math.round(scored.reduce((a, t) => a + t.normalized, 0) / scored.length) : 0;
  const vandalCount = scored.filter((t) => t.vandal >= 1).length;
  const socketCount = scored.filter((t) => t.socket).length;
  const types = [...new Set(words.map((w) => w.source.type))];

  els.infoboxTitle.textContent = "Clipping data";
  els.infoboxBody.innerHTML = [
    ["Words spliced", words.length],
    ["Sources spliced", sourceSet.size],
    ["Avg. splice score", `${avg}/100`],
    ["Ontological vandalism", `${vandalCount} jump${vandalCount === 1 ? "" : "s"}`],
    ["Socket words", socketCount],
    ["Topics crossed", types.map((t) => TYPE_META[t].emoji).join(" ")],
  ]
    .map(([k, v]) => `<tr><td class="k">${escapeHtml(String(k))}</td><td class="v">${v}</td></tr>`)
    .join("");
  els.infobox.hidden = false;
}

function renderStitchNotes(result) {
  const { words, transitions } = result;
  els.stitchNotes.innerHTML = words
    .map((w, i) => {
      const t = transitions[i];
      const meta = TYPE_META[w.source.type];
      const srcLink = `<a href="${w.source.url}" target="_blank" rel="noopener">${escapeHtml(w.source.title)}</a>`;
      const posPill = `<span class="type-pill">${w.tag}</span>`;
      if (!t) {
        return `<li id="note-${i}"><strong>[${i + 1}]</strong> “${escapeHtml(w.word)}” ${posPill} opening pick, from ${srcLink} ${meta.emoji} <span class="type-pill">${meta.label}</span> — chosen to open confidently, not spliced from a prior word.</li>`;
      }
      const cls = bucketOf(t.normalized);
      const fromMeta = TYPE_META[t.fromType];
      const bits = [];
      if (t.socket) bits.push("socket word");
      if (t.entity) bits.push("proper-noun collision");
      if (t.allit) bits.push("alliterates with the last word");
      if (t.vandal >= 1) bits.push(`ontological vandalism: ${fromMeta.label} → ${meta.label}`);
      bits.push(`grammar fit ${Math.round(t.grammar * 100)}%`);
      return (
        `<li id="note-${i}"><strong>[${i + 1}]</strong> “${escapeHtml(w.word)}” ${posPill} <span class="score-tag ${cls}">${t.normalized}/100</span> ` +
        `from ${srcLink} ${meta.emoji} <span class="type-pill">${meta.label}</span> ` +
        `<span class="breakdown">(${bits.join(", ")})</span></li>`
      );
    })
    .join("");
}

function applyStitchState() {
  document.body.classList.toggle("stitches-on", stitchesOn);
  els.stitchNotes.hidden = !stitchesOn;
  els.btnStitches.textContent = stitchesOn ? "\u{1F4CE} Hide clippings" : "\u{1F4CE} Show clippings";
  els.btnStitches.classList.toggle("active", stitchesOn);
}

// ---- sharing -----------------------------------------------------------

function buildShareText(wordCount, sourceCount, url) {
  const prefix = `WordSplice stitched a ${wordCount}-word "sentence" out of ${sourceCount} real Wikipedia articles, one verbatim word at a time. `;
  const suffix = ` ${url}`;
  const budget = 300 - suffix.length;
  const text = prefix.length > budget ? prefix.slice(0, Math.max(0, budget - 1)) + "…" : prefix;
  return text + suffix;
}

function currentUrl() {
  return `${location.origin}${location.pathname}`;
}

// ---- boot ----------------------------------------------------------------

async function generate() {
  history.replaceState(null, "", "/");
  setStatus("Fetching random articles from Wikipedia…");
  setBusy(true);
  els.btnStitches.disabled = true;
  els.btnShare.disabled = true;
  els.btnPermalink.disabled = true;
  try {
    const pool = await gatherPool();
    if (!meetsThresholds(pool)) throw new Error("Wikipedia didn't return enough usable words that round — try again.");

    let built = null;
    let templates = null;
    for (let attempt = 0; attempt < 3 && (!built || built.beam.words.length < 8); attempt++) {
      const candidateTemplates = pickTemplates();
      const candidate = buildArticle(pool, candidateTemplates);
      if (candidate && (!built || candidate.beam.words.length > built.beam.words.length)) {
        built = candidate;
        templates = candidateTemplates;
      }
    }
    if (!built || built.beam.words.length < 6) throw new Error("Couldn't stitch together enough words — try again.");

    const result = { words: built.beam.words, transitions: built.beam.transitions, slots: built.slots };
    renderResult(result);
    history.pushState(null, "", "/a/" + encodeState(templates, built.beam));
    setStatus("");
  } catch (e) {
    setStatus(String((e && e.message) || e), true);
  } finally {
    setBusy(false);
  }
}

async function loadFromPath(compact) {
  setStatus("Rebuilding the exact splice from this link…");
  setBusy(true);
  try {
    const result = await reconstructFromCompact(compact);
    renderResult(result);
    setStatus("");
  } catch (e) {
    setStatus(`${(e && e.message) || e} Generating a fresh one instead.`, true);
    await generate();
  } finally {
    setBusy(false);
  }
}

async function boot() {
  const compact = decodePath();
  if (compact) {
    await loadFromPath(compact);
  } else {
    await generate();
  }

  window.addEventListener("popstate", () => {
    const c = decodePath();
    if (c) loadFromPath(c);
  });

  els.btnRandomize.addEventListener("click", generate);

  els.btnStitches.addEventListener("click", () => {
    stitchesOn = !stitchesOn;
    applyStitchState();
  });

  els.btnShare.addEventListener("click", () => {
    if (!current) return;
    const sourceSet = new Set(current.words.map((w) => w.source.pageid));
    const url = currentUrl();
    const text = buildShareText(current.words.length, sourceSet.size, url);
    window.open(`https://bsky.app/intent/compose?text=${encodeURIComponent(text)}`, "_blank", "noopener");
  });

  els.btnPermalink.addEventListener("click", async () => {
    const url = currentUrl();
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      window.prompt("Copy this permalink:", url);
      return;
    }
    els.toast.hidden = false;
    setTimeout(() => (els.toast.hidden = true), 1600);
  });
}

boot();
