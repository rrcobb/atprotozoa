// GraftPedia — splicepedia spliced whole sentences, wordsplice spliced whole
// words. This is the level in between: a shallow grammatical parser breaks
// real Wikipedia sentences into noun phrases, verb phrases, prepositional
// phrases, adjective phrases, relative clauses and subordinate clauses, and
// only WHOLE COMPATIBLE CHUNKS get swapped — never a whole sentence, never a
// single bare word. Each chunk carries a hand-derived grammar signature
// (role, number, person, tense, determiner, transitivity) used both to pick
// a plausible replacement and to explain the splice in "show stitches" mode.
// Every scrap of text in the output is still copied verbatim from a real
// article; the only things this site writes itself are tiny repairs (a/an,
// capitalization, subject-verb agreement, pronoun number agreement) at the
// graft seams. Runs entirely client-side against Wikipedia's CORS-enabled
// action API. No backend.

const API = "https://en.wikipedia.org/w/api.php";
const MIN_EXTRACT_LEN = 400;
const ARTICLES_PER_BATCH = 10;
const MIN_SOURCES = 6;
const SKELETON_SENTENCES_DEFAULT = 5;
const MAX_PINS = 8;
const GRAFTABLE_TYPES = ["NP", "VP", "PP", "AdjP", "RelClause", "SubClause"];

// ---- Wikipedia fetch -------------------------------------------------------
// Same two-step dance as splicepedia/wordsplice: TextExtracts only ever
// returns a full plain-text extract for one page per request, so titles are
// fetched cheaply in one call and full extracts fetched per-page in parallel.

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
    redirects: "1",
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

// Pinned titles are user-typed, so a page can be "missing" (typo, doesn't
// exist) rather than just occasionally flaky like a random title always is.
// Returned alongside the raw pages so the caller can report which pins
// didn't resolve, instead of silently dropping them.
async function fetchPinnedPages(titles) {
  const results = await Promise.all(
    titles.map(async (title) => {
      try {
        const page = await fetchPageFull(title);
        if (!page || page.missing || !page.extract) return { title, page: null };
        if (page.extract.length < MIN_EXTRACT_LEN) return { title, page: null };
        return { title, page };
      } catch {
        return { title, page: null };
      }
    })
  );
  return results;
}

// ---- text -> sentences ------------------------------------------------------

function looksLikeHeading(line) {
  if (/[.!?]["'”)]?$/.test(line)) return false;
  return line.length < 60;
}

function cleanLine(line) {
  return line.replace(/\[\d+\]/g, "").replace(/\s{2,}/g, " ").trim();
}

function splitIntoSentences(extract) {
  const lines = (extract || "").split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const sentences = [];
  for (const raw of lines) {
    if (looksLikeHeading(raw)) continue;
    const line = cleanLine(raw);
    if (!line) continue;
    const parts = line.split(/(?<=[.!?])\s+(?=[A-Z0-9"'(“])/);
    for (const part of parts) {
      const t = part.trim();
      if (t.length < 35 || t.length > 260) continue;
      if (!/[.!?]["')”]?$/.test(t)) continue;
      if (!/^[A-Z0-9"'“]/.test(t)) continue;
      if (t.split(/\s+/).length < 7) continue;
      sentences.push(t);
    }
  }
  return sentences;
}

function wikiUrl(title) {
  return "https://en.wikipedia.org/wiki/" + encodeURIComponent(title.replace(/ /g, "_"));
}

// ---- rough entity typing, for "ontological vandalism" ---------------------
// Same categories -> type classifier as splicepedia/wordsplice: a chunk
// inherits its source article's type, and a graft between wildly different
// types gets the curated vandalism bonus.

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
  return VANDAL_PAIRS.has([typeA, typeB].sort().join("|")) ? 1 : 0.65;
}

function isOntologicalJump(typeA, typeB) {
  return typeA !== typeB && typeA !== "other" && typeB !== "other";
}

// "Similarity around 0.4-0.6 should often beat 0 or 1" — reward the middle,
// same bell curve every sibling site uses, applied here to chunk-length
// similarity as the "contextual plausibility" signal.
function bellOverlap(j) {
  return Math.max(0, 1 - Math.abs(j - 0.5) * 2);
}

// ---- tokenizing + rough POS tagging ----------------------------------------
//
// No POS tagger or parser library ships in a static Cloudflare asset bundle,
// so this is entirely hand-rolled: a closed-class lookup for function words
// plus suffix guessing for open-class content words, extended here (versus
// wordsplice's version) with plural/tense/vowel-sound guesses the chunker
// needs for grammar signatures and seam repairs. It is wrong plenty of the
// time — a slightly-off number or tense guess is part of the joke, the rest
// is which unrelated article the chunk was actually cut from.

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
  more: "ADV", most: "ADV", again: "ADV", ago: "ADV", instead: "ADV", together: "ADV",
  away: "ADV", back: "ADV", forward: "ADV", afterward: "ADV", afterwards: "ADV",
};

// "-er/-est/-ent/-ant" are deliberately left OUT of the suffix guess below:
// they hit far more common Wikipedia-prose nouns (river, rodent, president,
// continent, agent, event, giant, restaurant...) than adjectives, so a
// blanket suffix rule does more damage than skipping it. The real
// adjectives that pattern would have caught (different, important,
// distant, current...) are listed explicitly in ADJ_WORDS instead — a
// closed vocabulary check is unambiguous where a suffix guess isn't.
function guessContentTag(word) {
  const w = word.toLowerCase();
  if (/ly$/.test(w) && w.length > 4) return "ADV";
  if (/(tion|sion|ment|ness|ity|ism|ance|ence|ology|graphy|ship|hood|dom)$/.test(w)) return "NOUN";
  if (/(ing|ed)$/.test(w) && w.length > 4) return "VERB";
  if (/(ive|ous|al|ic|able|ible|ary|ful|less)$/.test(w) && w.length > 4) return "ADJ";
  return "NOUN";
}

// Closed-vocabulary overrides checked BEFORE the suffix guess above: common
// verbs (especially short irregular past tenses like "led"/"sat"/"ran" and
// bare-present forms like "provide"/"require" that no suffix rule catches)
// and common adjectives that don't end in a recognizable suffix ("large",
// "old", "high"...). Still nowhere near a real tagger — just enough closed
// vocabulary to stop the most common nouns-that-look-like-something-else
// and verbs/adjectives-that-look-like-nouns from wrecking chunk boundaries.
const VERB_LEMMAS = [
  "be", "have", "do", "say", "get", "make", "go", "know", "take", "see", "come", "think", "look",
  "want", "give", "use", "find", "tell", "ask", "work", "seem", "feel", "try", "leave", "call",
  "live", "believe", "bring", "happen", "write", "provide", "sit", "stand", "lose", "pay", "meet",
  "include", "continue", "set", "learn", "change", "lead", "understand", "watch", "follow", "stop",
  "create", "speak", "read", "allow", "add", "spend", "grow", "open", "walk", "win", "offer",
  "remember", "love", "consider", "appear", "buy", "wait", "serve", "die", "send", "expect",
  "build", "stay", "fall", "cut", "reach", "kill", "remain", "suggest", "raise", "pass", "sell",
  "require", "report", "decide", "pull", "return", "explain", "hope", "develop", "carry", "break",
  "receive", "agree", "support", "hit", "produce", "eat", "cover", "catch", "draw", "choose",
  "cause", "describe", "occur", "involve", "form", "join", "feed", "establish", "become", "wear",
  "hold", "run", "force", "prove", "arrive", "ensure", "play", "move", "turn", "start", "help",
  "talk", "begin", "keep", "let", "put", "mean", "show", "hear", "teach", "study", "fight",
  "publish", "record", "perform", "operate", "conduct", "attend", "host", "cross", "travel",
  "settle", "found", "command", "govern", "rule", "invade", "conquer", "defeat", "capture",
  "destroy", "survive", "adopt", "reject", "approve", "announce", "declare", "claim", "argue",
  "state", "note", "observe", "discover", "identify", "reveal", "demonstrate", "indicate",
  "confirm", "measure", "calculate", "estimate", "predict", "affect", "influence", "contribute",
  "depend", "rely", "result", "derive", "originate", "emerge", "evolve", "spread", "expand",
  "increase", "decrease", "reduce", "limit", "restrict", "control", "manage", "organize",
  "coordinate", "direct", "guide",
];
const IRREGULAR_VERB_FORMS = [
  "was", "were", "been", "being", "am",
  "had", "has", "did", "does",
  "said", "says", "went", "goes", "going", "took", "takes", "taking", "saw", "sees", "seeing",
  "gave", "gives", "giving", "knew", "knows", "knowing", "came", "comes", "coming", "thought",
  "thinks", "thinking", "found", "finds", "finding", "told", "tells", "telling", "became",
  "becomes", "becoming", "left", "leaves", "leaving", "felt", "feels", "feeling", "brought",
  "brings", "bringing", "began", "begins", "beginning", "kept", "keeps", "keeping", "held",
  "holds", "holding", "wrote", "writes", "writing", "stood", "stands", "standing", "heard",
  "hears", "hearing", "lets", "letting", "meant", "means", "meaning", "met", "meets", "meeting",
  "ran", "runs", "running", "paid", "pays", "paying", "sat", "sits", "sitting", "spoke", "speaks",
  "speaking", "lay", "lies", "lying", "led", "leads", "leading", "grew", "grows", "growing",
  "lost", "loses", "losing", "fell", "falls", "falling", "sent", "sends", "sending", "built",
  "builds", "building", "understood", "understands", "understanding", "drew", "draws", "drawing",
  "broke", "breaks", "breaking", "spent", "spends", "spending", "cuts", "cutting", "rose", "rises",
  "rising", "drove", "drives", "driving", "bought", "buys", "buying", "wore", "wears", "wearing",
  "chose", "chooses", "choosing", "caught", "catches", "catching", "fought", "fights", "fighting",
  "taught", "teaches", "teaching", "sought", "seeks", "seeking", "threw", "throws", "throwing",
  "shot", "shoots", "shooting", "hung", "hangs", "hanging", "forgot", "forgets", "forgetting",
  "slept", "sleeps", "sleeping", "sold", "sells", "selling", "shown", "showed", "shows", "showing",
];
function inflect3sg(base) {
  if (/[sxz]$|[cs]h$/.test(base)) return base + "es";
  if (/[^aeiou]y$/.test(base)) return base.slice(0, -1) + "ies";
  return base + "s";
}
const VERB_WORDS = new Set([...VERB_LEMMAS, ...VERB_LEMMAS.map(inflect3sg), ...IRREGULAR_VERB_FORMS]);

const ADJ_WORDS = new Set([
  "large", "small", "high", "low", "good", "bad", "old", "new", "young", "long", "short", "wide",
  "deep", "dark", "bright", "rich", "poor", "strong", "weak", "hard", "soft", "warm", "cold",
  "hot", "cool", "dry", "wet", "clean", "thick", "thin", "heavy", "light", "fast", "slow",
  "close", "far", "tall", "flat", "round", "loud", "quiet", "calm", "wild", "brave", "kind",
  "fair", "sweet", "plain", "fine", "grand", "vast", "tiny", "huge", "giant", "massive", "minor",
  "major", "chief", "prime", "sole", "mere", "mild", "harsh", "grim", "bold", "shy", "proud",
  "false", "true", "real", "exact", "vague", "clear", "dim", "keen", "eager", "different",
  "important", "significant", "relevant", "distant", "pleasant", "confident", "constant",
  "pregnant", "elegant", "current", "recent", "ancient", "efficient", "sufficient", "consistent",
  "prominent", "dominant", "brilliant", "native", "famous", "ready", "alive", "dead", "whole",
  "entire", "full", "empty", "common", "rare", "similar", "various", "several", "certain",
  "particular", "specific", "general", "average", "typical", "natural", "original", "modern",
  "medieval", "traditional", "official", "formal", "informal", "national", "international",
  "regional", "local", "central", "eastern", "western", "northern", "southern", "main", "primary",
  "secondary", "private", "public", "popular", "known", "possible", "impossible", "likely",
  "unlikely", "available", "present", "absent", "active", "passive", "positive", "negative",
  "direct", "indirect", "complex", "simple", "basic", "advanced", "senior", "junior", "upper",
  "lower", "inner", "outer", "extra", "additional", "previous", "following", "former", "latter",
  "single", "double", "multiple", "individual", "personal", "physical", "mental", "emotional",
  "political", "economic", "cultural", "social", "historical", "religious", "spiritual",
  "scientific", "technical", "medical", "legal", "financial", "commercial", "industrial",
  "agricultural", "environmental", "biological", "chemical", "digital", "electronic",
  "mechanical", "structural", "functional", "visual", "verbal", "musical", "artistic", "literary",
  "academic", "professional", "domestic", "foreign", "colonial", "imperial", "royal", "noble",
  "sacred", "divine",
]);

function tagToken(raw, sentenceStart) {
  const lower = raw.toLowerCase();
  if (FUNCTION_TAGS[lower]) return FUNCTION_TAGS[lower];
  if (/^[A-Z]{2,}$/.test(raw)) return "PROPN";
  if (!sentenceStart && /^[A-Z]/.test(raw)) return "PROPN";
  if (VERB_WORDS.has(lower)) return "VERB";
  if (ADJ_WORDS.has(lower)) return "ADJ";
  return guessContentTag(raw);
}

// Tokenizes ONE sentence string, keeping commas/terminal punctuation as
// PUNCT tokens and recording each token's character span in that exact
// string. Grafting later just slices/splices these character spans — no
// re-joining-with-spaces logic needed, so original spacing, hyphens and
// apostrophes survive untouched wherever a graft doesn't touch them.
function tokenizeSentence(s) {
  const tokens = [];
  const re = /[A-Za-z][A-Za-z'-]*|[.,;:!?]/g;
  let m;
  let sentenceStart = true;
  while ((m = re.exec(s))) {
    const raw = m[0];
    const start = m.index;
    const end = start + raw.length;
    if (/^[A-Za-z]/.test(raw)) {
      tokens.push({ word: raw, tag: tagToken(raw, sentenceStart), start, end });
      sentenceStart = false;
    } else {
      tokens.push({ word: raw, tag: "PUNCT", start, end });
      if (raw === "." || raw === "!" || raw === "?") sentenceStart = true;
    }
  }
  return tokens;
}

// ---- number / tense / article helpers --------------------------------------

function isPlausiblePlural(word) {
  const w = word.toLowerCase();
  if (!/s$/.test(w)) return false;
  if (/(ss|us|is)$/.test(w)) return false; // crude singular-looking exceptions: class, campus, analysis
  return w.length > 3;
}

function nounNumber(word) {
  return isPlausiblePlural(word) ? "plur" : "sing";
}

const VOWEL_SOUND_CONSONANT_U = /^(uni|use|us|usu|utop|euro|ewe|one|once)/;
const SILENT_H = /^(hour|honest|honor|honou|heir)/;

function startsWithVowelSound(word) {
  const w = (word || "").toLowerCase();
  if (SILENT_H.test(w)) return true;
  if (/^[aeiou]/.test(w)) return !VOWEL_SOUND_CONSONANT_U.test(w);
  return false;
}

function articleFor(word) {
  return startsWithVowelSound(word) ? "an" : "a";
}

// ---- grammar signatures -----------------------------------------------------
// The brief's literal ask: "each replaceable chunk gets a grammar signature —
// role, tense, singular/plural, person, article needs, transitivity, and
// other agreement constraints." These signatures do double duty: they gate
// which candidates are even eligible to fill a slot, and their plain-English
// form (describeSig, below) is what "show stitches" prints for every graft.

function pronounSig(word) {
  const table = {
    i: { person: "1st", number: "sing" }, we: { person: "1st", number: "plur" },
    you: { person: "2nd", number: "sing/plur" },
    he: { person: "3rd", number: "sing" }, she: { person: "3rd", number: "sing" },
    it: { person: "3rd", number: "sing" }, they: { person: "3rd", number: "plur" },
    who: { person: "3rd", number: "sing/plur" }, whom: { person: "3rd", number: "sing/plur" },
    which: { person: "3rd", number: "sing/plur" }, that: { person: "3rd", number: "sing/plur" },
  };
  const base = table[word.toLowerCase()] || { person: "3rd", number: "sing" };
  return { role: "pronoun", number: base.number, person: base.person, determiner: "none" };
}

function npSig(det, headWords) {
  const headWord = headWords[headWords.length - 1].word;
  const isProper = headWords[headWords.length - 1].tag === "PROPN";
  const number = isProper ? "sing" : nounNumber(headWord);
  const determiner = det ? (["a", "an"].includes(det.word.toLowerCase()) ? `indefinite (${det.word.toLowerCase()})` : det.word.toLowerCase()) : "none";
  return { role: "noun phrase", number, person: "3rd", determiner };
}

function adjSig(toks) {
  const last = toks[toks.length - 1].word.toLowerCase();
  let degree = "positive";
  if (/er$/.test(last) || toks.some((t) => t.word.toLowerCase() === "more")) degree = "comparative";
  if (/est$/.test(last) || toks.some((t) => t.word.toLowerCase() === "most")) degree = "superlative";
  return { role: "adjective phrase", degree };
}

function vpSig(auxWords, verbTok, predAdj, hasObj) {
  let tense = "present";
  if (auxWords.some((w) => ["was", "were", "had", "did"].includes(w))) tense = "past";
  else if (auxWords.some((w) => ["will", "shall"].includes(w))) tense = "future";
  else if (auxWords.some((w) => ["would", "could", "should", "might", "may", "must", "can"].includes(w))) tense = "modal";
  else if (auxWords.some((w) => ["is", "are", "am", "has", "have", "does", "do"].includes(w))) tense = "present";
  else if (verbTok && /ed$/.test(verbTok.word)) tense = "past";
  else if (verbTok && /ing$/.test(verbTok.word)) tense = "progressive";

  let number = null;
  if (auxWords.includes("is") || auxWords.includes("was") || auxWords.includes("has") || auxWords.includes("does")) number = "sing";
  else if (auxWords.includes("are") || auxWords.includes("were") || auxWords.includes("have") || auxWords.includes("do")) number = "plur";
  else if (verbTok && /s$/.test(verbTok.word) && !/ss$/.test(verbTok.word)) number = "sing";

  const transitivity = predAdj ? "copular" : hasObj ? "transitive" : "intransitive";
  return { role: "predicate", tense, number, transitivity };
}

function describeSig(type, sig) {
  const bits = [];
  if (sig.role) bits.push(sig.role);
  if (sig.number) bits.push(`number: ${sig.number === "plur" ? "plural" : sig.number === "sing" ? "singular" : sig.number}`);
  if (sig.person) bits.push(`person: ${sig.person}`);
  if (sig.determiner) bits.push(`determiner: ${sig.determiner}`);
  if (sig.tense) bits.push(`tense: ${sig.tense}`);
  if (sig.transitivity) bits.push(`transitivity: ${sig.transitivity}`);
  if (sig.degree) bits.push(`degree: ${sig.degree}`);
  if (sig.animacy) bits.push(`animacy: ${sig.animacy}`);
  if (sig.conj) bits.push(`conjunction: "${sig.conj.toLowerCase()}"`);
  return bits.join(" · ");
}

// ---- shallow chunker / parser ----------------------------------------------
//
// Not a real CFG parser — a greedy, left-to-right recursive-descent chunker
// over the POS tags, closer to NLTK's RegexpParser than to a treebank
// grammar. It doesn't require full-sentence coverage: any stretch it can't
// make sense of is just left as literal skeleton text (never touched, never
// mis-grafted), and every chunk it DOES find is real, nested, and
// independently graftable — an NP can contain a PP which contains another
// NP, and each level is its own candidate slot. That nesting is what makes
// "skeleton from A, subject NP from B, its relative clause from C, an
// adjective phrase from D" possible without any special-casing: it falls
// out of picking a set of non-overlapping chunks across the whole tree.

const RELATIVIZERS = new Set(["that", "which", "who", "whom"]);
const SUBORDINATORS = new Set(["although", "because", "while", "when", "though", "unless", "whereas", "if", "since", "after", "before", "until"]);
const GUARDED_SUBORDINATORS = new Set(["since", "after", "before", "until"]); // ambiguous with PREP use ("Before 1990, ...")

function parseNP(tokens, i, out) {
  if (i >= tokens.length) return null;
  if (tokens[i].tag === "PRON") {
    const tok = tokens[i];
    const node = { type: "NP", start: tok.start, end: tok.end, sig: pronounSig(tok.word) };
    out.push(node);
    return { node, next: i + 1 };
  }

  let det = null;
  let j = i;
  if (tokens[j] && tokens[j].tag === "DET") { det = tokens[j]; j++; }

  const adjStart = j;
  while (tokens[j] && (tokens[j].tag === "ADV" || tokens[j].tag === "ADJ")) j++;
  const adjEnd = j;

  const headStart = j;
  while (tokens[j] && (tokens[j].tag === "NOUN" || tokens[j].tag === "PROPN")) j++;
  const headEnd = j;

  if (headEnd === headStart) return null; // no head noun -> not a noun phrase, bail

  const headWords = tokens.slice(headStart, headEnd);
  const npStart = det ? det.start : adjEnd > adjStart ? tokens[adjStart].start : tokens[headStart].start;
  const node = { type: "NP", start: npStart, end: tokens[headEnd - 1].end, sig: npSig(det, headWords) };

  if (adjEnd > adjStart) {
    const adjNode = { type: "AdjP", start: tokens[adjStart].start, end: tokens[adjEnd - 1].end, sig: adjSig(tokens.slice(adjStart, adjEnd)) };
    out.push(adjNode);
    node.adjP = adjNode;
  }
  out.push(node);
  j = headEnd;

  if (tokens[j] && tokens[j].tag === "PREP") {
    const ppRes = parsePP(tokens, j, out);
    if (ppRes) { node.pp = ppRes.node; node.end = ppRes.node.end; j = ppRes.next; }
  }
  // Matched by WORD, not tag: "that" is listed as DET in FUNCTION_TAGS
  // (it's also a demonstrative determiner), but right after a completed NP
  // head it's overwhelmingly being used as a relativizer instead.
  if (tokens[j] && RELATIVIZERS.has(tokens[j].word.toLowerCase())) {
    const relRes = parseRelClause(tokens, j, out);
    if (relRes) { node.rel = relRes.node; node.end = relRes.node.end; j = relRes.next; }
  }
  return { node, next: j };
}

function parsePP(tokens, i, out) {
  const prep = tokens[i];
  if (!prep || prep.tag !== "PREP") return null;
  const npRes = parseNP(tokens, i + 1, out);
  if (!npRes) return null;
  const node = { type: "PP", start: prep.start, end: npRes.node.end, sig: { role: "prepositional phrase", preposition: prep.word.toLowerCase() }, obj: npRes.node };
  out.push(node);
  return { node, next: npRes.next };
}

function parseRelClause(tokens, i, out) {
  const relTok = tokens[i];
  const vpRes = parseVP(tokens, i + 1, out);
  if (!vpRes) return null;
  const animacy = ["who", "whom"].includes(relTok.word.toLowerCase()) ? "person" : "thing";
  const node = {
    type: "RelClause",
    start: relTok.start,
    end: vpRes.node.end,
    relWord: relTok.word,
    sig: { role: "relative clause", relWord: relTok.word, animacy },
    vp: vpRes.node,
  };
  out.push(node);
  return { node, next: vpRes.next };
}

function parseVP(tokens, i, out) {
  let j = i;
  const auxToks = [];
  while (tokens[j] && tokens[j].tag === "AUX") { auxToks.push(tokens[j]); j++; }
  while (tokens[j] && tokens[j].tag === "ADV") j++;

  let verbTok = null;
  let predAdj = null;
  if (tokens[j] && tokens[j].tag === "VERB") { verbTok = tokens[j]; j++; }
  else if (tokens[j] && tokens[j].tag === "ADJ" && auxToks.length) {
    const adjStart = j;
    while (tokens[j] && (tokens[j].tag === "ADV" || tokens[j].tag === "ADJ")) j++;
    predAdj = { type: "AdjP", start: tokens[adjStart].start, end: tokens[j - 1].end, sig: adjSig(tokens.slice(adjStart, j)) };
    out.push(predAdj);
  }
  if (!verbTok && !predAdj && !auxToks.length) return null;

  const verbGroupEnd = tokens[j - 1] ? tokens[j - 1].end : (auxToks.length ? auxToks[auxToks.length - 1].end : 0);
  const verbGroupStart = auxToks.length ? auxToks[0].start : verbTok ? verbTok.start : predAdj.start;

  while (tokens[j] && tokens[j].tag === "ADV") j++;

  let objNode = null;
  if (tokens[j] && ["DET", "ADJ", "ADV", "NOUN", "PROPN", "PRON"].includes(tokens[j].tag)) {
    const npRes = parseNP(tokens, j, out);
    if (npRes) { objNode = npRes.node; j = npRes.next; }
  }

  const pps = [];
  while (tokens[j] && tokens[j].tag === "PREP") {
    const ppRes = parsePP(tokens, j, out);
    if (!ppRes) break;
    pps.push(ppRes.node);
    j = ppRes.next;
  }

  const auxWords = auxToks.map((t) => t.word.toLowerCase());
  const node = {
    type: "VP",
    start: verbGroupStart,
    end: tokens[j - 1] ? tokens[j - 1].end : verbGroupEnd,
    sig: vpSig(auxWords, verbTok, predAdj, !!objNode),
    verbGroup: { start: verbGroupStart, end: verbGroupEnd },
    obj: objNode,
    pps,
    predAdj,
  };
  out.push(node);
  return { node, next: j };
}

// Walks a tokenized sentence once, left to right, entering the recursive
// chunk parsers whenever the current tag could start one. Returns every
// constituent found (flat, but spans naturally nest) plus explicit
// references to the sentence's subject NP and main VP — needed later for
// the subject-verb agreement repair, and easy to lose track of otherwise
// since a relative clause's own embedded VP gets discovered (and pushed to
// the same flat list) before the main predicate is.
function chunkSentence(tokens) {
  const nodes = [];
  let subjectNode = null;
  let mainVP = null;
  let i = 0;

  if (tokens.length && tokens[0].tag === "CONJ" && SUBORDINATORS.has(tokens[0].word.toLowerCase())) {
    let commaIdx = -1;
    for (let k = 1; k < tokens.length && k <= 20; k++) {
      if (tokens[k].tag === "PUNCT" && tokens[k].word === ",") { commaIdx = k; break; }
    }
    if (commaIdx !== -1) {
      const word0 = tokens[0].word.toLowerCase();
      const hasVerb = tokens.slice(1, commaIdx).some((t) => t.tag === "AUX" || t.tag === "VERB");
      if (hasVerb || !GUARDED_SUBORDINATORS.has(word0)) {
        nodes.push({
          type: "SubClause",
          start: tokens[0].start,
          end: tokens[commaIdx].start,
          sig: { role: "subordinate clause", conj: tokens[0].word },
        });
        i = commaIdx + 1;
      }
    }
  }

  while (i < tokens.length) {
    const t = tokens[i];
    if (t.tag === "PUNCT" || t.tag === "CONJ") { i++; continue; }
    if (t.tag === "PREP") {
      const pp = parsePP(tokens, i, nodes);
      if (pp) { i = pp.next; continue; }
      i++; continue;
    }
    if (t.tag === "AUX" || t.tag === "VERB") {
      const vp = parseVP(tokens, i, nodes);
      if (vp) { if (!mainVP) mainVP = vp.node; i = vp.next; continue; }
      i++; continue;
    }
    if (["DET", "ADJ", "ADV", "NOUN", "PROPN", "PRON"].includes(t.tag)) {
      const np = parseNP(tokens, i, nodes);
      if (np) { if (!subjectNode) subjectNode = np.node; i = np.next; continue; }
      i++; continue;
    }
    i++;
  }

  return { nodes, subjectNode, mainVP };
}

// ---- pool: fetch articles, parse every sentence into graftable chunks -----

function parseArticleIntoPool(page) {
  const type = classify(page.categories);
  const source = { pageid: page.pageid, title: page.title, url: wikiUrl(page.title), type };
  const rawSentences = splitIntoSentences(page.extract || "").slice(0, 8);
  const parsedSentences = [];
  for (const text of rawSentences) {
    const tokens = tokenizeSentence(text);
    if (tokens.filter((t) => t.tag !== "PUNCT").length < 7) continue;
    const { nodes, subjectNode, mainVP } = chunkSentence(tokens);
    if (!nodes.length) continue;
    nodes.forEach((n) => { n.source = source; n.sentenceText = text; });
    parsedSentences.push({ text, tokens, nodes, subjectNode, mainVP, source });
  }
  return { source, sentences: parsedSentences };
}

const REQUIRED_TYPE_MIN = { NP: 25, VP: 12, PP: 10, AdjP: 6 };

function typeCounts(articles) {
  const counts = new Map();
  for (const a of articles) for (const s of a.sentences) for (const n of s.nodes) counts.set(n.type, (counts.get(n.type) || 0) + 1);
  return counts;
}

function meetsThresholds(articles) {
  const counts = typeCounts(articles);
  const uniqueSources = new Set(articles.map((a) => a.source.pageid)).size;
  if (uniqueSources < MIN_SOURCES) return false;
  return Object.entries(REQUIRED_TYPE_MIN).every(([type, min]) => (counts.get(type) || 0) >= min);
}

// Pinned titles (user-chosen, "which articles go into the mix") are always
// fetched and parsed into the pool first; random articles then backfill it
// up to MIN_SOURCES / REQUIRED_TYPE_MIN, exactly like the old all-random
// gatherArticles did, so pinning three articles never starves the pool of
// the variety a good graft needs. Returns the pool plus a report of which
// pins actually resolved, for the UI to show what ended up in the mix.
async function gatherArticles(pinnedTitles, onStatus) {
  const articles = [];
  const seenTitles = new Set();
  const pinnedResolved = [];
  const pinnedFailed = [];

  if (pinnedTitles && pinnedTitles.length) {
    if (onStatus) onStatus(`Fetching ${pinnedTitles.length} pinned article${pinnedTitles.length === 1 ? "" : "s"}…`);
    const results = await fetchPinnedPages(pinnedTitles);
    for (const { title, page } of results) {
      if (!page) { pinnedFailed.push(title); continue; }
      if (seenTitles.has(page.title)) continue;
      seenTitles.add(page.title);
      const parsed = parseArticleIntoPool(page);
      if (parsed.sentences.length) { articles.push(parsed); pinnedResolved.push(page.title); }
      else pinnedFailed.push(title);
    }
  }

  let attempts = 0;
  while (attempts < 5) {
    if (meetsThresholds(articles)) break;
    if (onStatus) {
      onStatus(
        articles.length
          ? `Backfilling with more random articles to round out the mix… (${articles.length} so far)`
          : "Fetching random articles from Wikipedia and parsing them into phrases…"
      );
    }
    const pages = await fetchRandomPages(ARTICLES_PER_BATCH);
    for (const page of pages) {
      if (!page || page.missing || !page.extract) continue;
      if (page.extract.length < MIN_EXTRACT_LEN) continue;
      if (seenTitles.has(page.title)) continue;
      seenTitles.add(page.title);
      const parsed = parseArticleIntoPool(page);
      if (parsed.sentences.length) articles.push(parsed);
    }
    attempts++;
  }

  const backfilled = articles.map((a) => a.source.title).filter((t) => !pinnedResolved.includes(t));
  return { articles, mix: { pinned: pinnedResolved, backfilled, failed: pinnedFailed } };
}

function poolByType(articles) {
  const map = new Map();
  for (const a of articles) {
    for (const s of a.sentences) {
      for (const n of s.nodes) {
        if (!map.has(n.type)) map.set(n.type, []);
        map.get(n.type).push(n);
      }
    }
  }
  return map;
}

// ---- graft scoring -----------------------------------------------------
//
// "Optimize for perfect grammar + high semantic mismatch + slight
// contextual plausibility." Grammar fit rewards a same-slot candidate whose
// signature actually agrees (so fewer repairs are needed); semantic
// mismatch reuses the ontological-vandalism table from splicepedia/
// wordsplice; contextual plausibility is the same "reward the deniable
// middle" bell curve, applied here to how similar in length the two chunks
// are — near-identical or wildly different lengths both read as less
// convincing than a close-but-not-exact match.

// vandalWeight is the splicer's "semantic mismatch bias" control: 1 is the
// original tuning, <1 leans the score toward grammar fit and contextual
// plausibility instead, >1 leans it toward the most ontologically insulting
// jump available. maxScoreFor mirrors the same weight into the normalizer so
// a 0-100 "graft score" still means the same thing regardless of bias.
function maxScoreFor(vandalWeight) {
  return 1.4 * 0.85 + 1.6 * 1 * vandalWeight + 0.7 * 1;
}

function scoreGraft(target, cand, vandalWeight) {
  const vandal = vandalismBonus(target.source.type, cand.source.type);
  const jump = isOntologicalJump(target.source.type, cand.source.type);

  let grammarFit = 0.5; // baseline: type slot already matches, that's the hard requirement
  if (target.type === "NP" && target.sig.number && cand.sig.number && target.sig.number === cand.sig.number) grammarFit += 0.35;
  else if (target.type === "VP") {
    if (target.sig.tense && cand.sig.tense && target.sig.tense === cand.sig.tense) grammarFit += 0.2;
    if (target.sig.transitivity === cand.sig.transitivity) grammarFit += 0.15;
  } else if (target.type === "RelClause" && target.sig.animacy === cand.sig.animacy) grammarFit += 0.35;

  const targetLen = target.end - target.start;
  const candLen = cand.end - cand.start;
  const lenSim = 1 - Math.abs(targetLen - candLen) / Math.max(targetLen, candLen, 1);
  const plausibility = bellOverlap(lenSim);

  const total = grammarFit * 1.4 + vandal * 1.6 * vandalWeight + plausibility * 0.7;
  return { total, vandal, jump, grammarFit, plausibility };
}

function normalizeScore(total, maxScore) {
  return Math.max(0, Math.min(100, Math.round((total / maxScore) * 100)));
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Picks skeletonSentences real sentences to serve as skeletons, then for
// every graftable chunk in every skeleton (skipping any type unchecked in
// the splicer controls), finds its single best-scoring replacement from
// anywhere else in the pool (never the same source article). All candidate
// grafts are then sorted best-first and accepted greedily as long as they
// don't overlap a chunk already claimed in that sentence — this is the
// ranked list the corruption-strength slider later slices a prefix of, so
// raising the slider always adds the NEXT most "optimal" graft rather than
// a random one.
function buildSkeleton(articles, opts) {
  const enabledTypes = (opts && opts.enabledTypes) || new Set(GRAFTABLE_TYPES);
  const vandalWeight = (opts && opts.vandalWeight) || 1;
  const skeletonSentences = (opts && opts.skeletonSentences) || SKELETON_SENTENCES_DEFAULT;

  const allSentences = [];
  for (const a of articles) for (const s of a.sentences) if (s.nodes.length) allSentences.push(s);
  shuffle(allSentences);

  const skeleton = [];
  const usedTitles = new Set();
  for (const s of allSentences) {
    if (skeleton.length >= skeletonSentences) break;
    if (usedTitles.has(s.source.title) && usedTitles.size < allSentences.length) continue;
    skeleton.push(s);
    usedTitles.add(s.source.title);
  }
  if (skeleton.length < Math.min(3, allSentences.length)) {
    for (const s of allSentences) {
      if (skeleton.length >= skeletonSentences) break;
      if (!skeleton.includes(s)) skeleton.push(s);
    }
  }
  if (!skeleton.length) return null;

  const byType = poolByType(articles);
  const allGrafts = [];
  skeleton.forEach((sent, sentenceIdx) => {
    for (const node of sent.nodes) {
      if (!enabledTypes.has(node.type)) continue;
      const candidates = byType.get(node.type) || [];
      let best = null;
      for (const cand of candidates) {
        if (cand.source.title === sent.source.title) continue; // never graft from the skeleton's own article
        if (cand === node) continue;
        const score = scoreGraft(node, cand, vandalWeight);
        if (!best || score.total > best.score.total) best = { candidate: cand, score };
      }
      if (best) allGrafts.push({ sentenceIdx, node, candidate: best.candidate, score: best.score });
    }
  });
  allGrafts.sort((a, b) => b.score.total - a.score.total);

  const accepted = [];
  const spansBySentence = new Map();
  for (const g of allGrafts) {
    const spans = spansBySentence.get(g.sentenceIdx) || [];
    if (spans.some(([s, e]) => g.node.start < e && s < g.node.end)) continue;
    spans.push([g.node.start, g.node.end]);
    spansBySentence.set(g.sentenceIdx, spans);
    accepted.push(g);
  }

  return { sentences: skeleton, accepted, maxScore: maxScoreFor(vandalWeight) };
}

// ---- auto-repair: a/an, capitalization, subject-verb agreement, pronouns --
//
// "Auto-repair tiny joins... never rewrite the actual source phrases beyond
// what is needed." Every repair below touches at most one existing word
// (the sentence's own article, verb, or a bare pronoun) — never the grafted
// text itself, which is always used exactly as copied.

function matchCase(original, replacement) {
  return /^[A-Z]/.test(original) ? replacement[0].toUpperCase() + replacement.slice(1) : replacement;
}

// Personal/possessive pronouns only — deliberately excludes relativizers
// ("who"/"which"/"that"), which are tagged PRON too but travel as part of
// whatever RelClause they open, not as standalone back-references.
const PERSONAL_PRONOUNS_SING = new Set(["it", "its", "itself", "he", "him", "his", "himself", "she", "her", "hers", "herself"]);
const PERSONAL_PRONOUNS_PLUR = new Set(["they", "them", "their", "theirs", "themselves"]);

// Going singular -> plural never requires a gender guess (every singular
// personal pronoun collapses onto the same plural set), so this direction is
// always safe. "her" alone is ambiguous between object ("saw her" -> "saw
// them") and possessive determiner ("her book" -> "their book"); resolved by
// peeking at whether the next token starts a noun phrase.
function pluralPronounFor(word, nextTok) {
  const w = word.toLowerCase();
  if (w === "her") return nextTok && ["NOUN", "PROPN", "ADJ"].includes(nextTok.tag) ? "their" : "them";
  const map = {
    it: "they", its: "their", itself: "themselves",
    he: "they", him: "them", his: "their", himself: "themselves",
    she: "they", hers: "theirs", herself: "themselves",
  };
  return map[w] || null;
}

// Plural -> singular DOES require picking a gender, which nothing here can
// know — so this only ever resolves to the gender-neutral "it" family, and
// callers skip it entirely when the grafted subject's source article is
// classified as a person (better to leave a plural pronoun slightly
// mismatched than confidently degender someone).
function singularNeutralPronounFor(word) {
  const map = { they: "it", them: "it", their: "its", theirs: "its", themselves: "itself" };
  return map[word.toLowerCase()] || null;
}

function repairVerbForNumber(text, number) {
  const w = text.trim();
  if (/\s/.test(w)) return null; // multi-word aux cluster ("has been") — too risky to rewrite, leave alone
  const lower = w.toLowerCase();
  const flip = { is: "are", are: "is", was: "were", were: "was", has: "have", have: "has", does: "do", do: "does" };
  if (number === "plur" && ["is", "was", "has", "does"].includes(lower)) return matchCase(w, flip[lower]);
  if (number === "sing" && ["are", "were", "have", "do"].includes(lower)) return matchCase(w, flip[lower]);
  if (number === "plur" && /^[a-z]+s$/i.test(w) && !/ss$/i.test(w)) return w.slice(0, -1);
  return null;
}

function findPrecedingArticleToken(tokens, spanStart) {
  for (const t of tokens) {
    if (t.tag !== "DET") continue;
    const lower = t.word.toLowerCase();
    if (lower !== "a" && lower !== "an") continue;
    if (t.end <= spanStart && spanStart - t.end <= 1) return t;
  }
  return null;
}

function computeRepairs(sent, grafts) {
  const repairs = [];

  if (sent.subjectNode && sent.mainVP && sent.mainVP.verbGroup) {
    const subjGraft = grafts.find((g) => g.node === sent.subjectNode);
    if (subjGraft) {
      const newNumber = subjGraft.candidate.sig.number;
      const vpAlsoGrafted = grafts.some((g) => g.node.start < sent.mainVP.verbGroup.end && g.node.end > sent.mainVP.verbGroup.start);
      if (!vpAlsoGrafted && (newNumber === "sing" || newNumber === "plur")) {
        const orig = sent.text.slice(sent.mainVP.verbGroup.start, sent.mainVP.verbGroup.end);
        const fixed = repairVerbForNumber(orig, newNumber);
        if (fixed && fixed !== orig) {
          repairs.push({
            start: sent.mainVP.verbGroup.start,
            end: sent.mainVP.verbGroup.end,
            text: fixed,
            reason: `verb agreement auto-repaired to match the grafted ${newNumber === "plur" ? "plural" : "singular"} subject`,
          });
        }
      }
    }
  }

  for (const g of grafts) {
    if (g.node.type !== "AdjP") continue;
    const detTok = findPrecedingArticleToken(sent.tokens, g.node.start);
    if (!detTok) continue;
    const graftedText = g.candidate.sentenceText.slice(g.candidate.start, g.candidate.end);
    const firstWordMatch = /^[A-Za-z']+/.exec(graftedText);
    if (!firstWordMatch) continue;
    const needed = articleFor(firstWordMatch[0]);
    if (needed !== detTok.word.toLowerCase()) {
      repairs.push({
        start: detTok.start,
        end: detTok.end,
        text: matchCase(detTok.word, needed),
        reason: "article auto-repaired (a/an) to match the grafted adjective",
      });
    }
  }

  // Pronoun back-references: if the subject NP itself got grafted, any bare
  // personal/possessive pronoun later in the SAME sentence that still points
  // at it ("...and it later collapsed") needs to agree in number with the
  // new subject, not the old one. Only touches pronouns that survived as
  // literal skeleton text — one inside another accepted graft's span came
  // along with that graft's own (already-consistent) source text.
  if (sent.subjectNode && grafts.length) {
    const subjGraft = grafts.find((g) => g.node === sent.subjectNode);
    if (subjGraft) {
      const newNumber = subjGraft.candidate.sig.number;
      const isPersonSource = subjGraft.candidate.source.type === "person";
      if (newNumber === "sing" || newNumber === "plur") {
        for (let ti = 0; ti < sent.tokens.length; ti++) {
          const tok = sent.tokens[ti];
          if (tok.tag !== "PRON") continue;
          if (tok.start < sent.subjectNode.end) continue; // only back-references AFTER the subject
          const overlapsGraft = grafts.some((g) => tok.start < g.node.end && g.node.start < tok.end);
          if (overlapsGraft) continue;
          const lower = tok.word.toLowerCase();
          let fixed = null;
          if (newNumber === "plur" && PERSONAL_PRONOUNS_SING.has(lower)) {
            fixed = pluralPronounFor(tok.word, sent.tokens[ti + 1]);
          } else if (newNumber === "sing" && !isPersonSource && PERSONAL_PRONOUNS_PLUR.has(lower)) {
            fixed = singularNeutralPronounFor(tok.word);
          }
          if (fixed && fixed !== lower) {
            repairs.push({
              start: tok.start,
              end: tok.end,
              text: matchCase(tok.word, fixed),
              reason: `pronoun auto-repaired to agree in number with the grafted ${newNumber === "plur" ? "plural" : "singular"} subject`,
            });
          }
        }
      }
    }
  }

  return repairs;
}

function maybeUppercaseFirst(text) {
  if (!text) return text;
  return text[0].toUpperCase() + text.slice(1);
}

function maybeLowercaseFirst(text) {
  const m = /^([A-Za-z']+)([\s\S]*)$/.exec(text);
  if (!m || !/^[A-Z]/.test(m[1])) return text;
  if (!FUNCTION_TAGS[m[1].toLowerCase()]) return text; // only safe to lowercase closed-class words
  return m[1][0].toLowerCase() + m[1].slice(1) + m[2];
}

// ---- turning a set of applied grafts into a self-contained render state ---
//
// The state produced here is EVERYTHING renderArticle needs: no re-fetch,
// re-tokenize or re-parse required to display it again, which is what makes
// permalinks (see encodeState/decodePath) work even after the source
// Wikipedia articles change or vanish.

function buildState(skeleton, bySentence, strength) {
  const maxScore = skeleton.maxScore || maxScoreFor(1);
  const sentences = skeleton.sentences.map((sent, si) => {
    const grafts = (bySentence.get(si) || []).slice();
    const repairs = computeRepairs(sent, grafts);

    const splices = grafts
      .map((g) => {
        let text = g.candidate.sentenceText.slice(g.candidate.start, g.candidate.end);
        if (g.node.start === 0) text = maybeUppercaseFirst(text);
        else if (g.candidate.start === 0) text = maybeLowercaseFirst(text);
        return {
          start: g.node.start,
          end: g.node.end,
          kind: "g",
          text,
          src: g.candidate.source,
          node: g.node.type,
          sig: g.candidate.sig,
          score: normalizeScore(g.score.total, maxScore),
          jump: g.score.jump,
        };
      })
      .concat(repairs.map((r) => ({ start: r.start, end: r.end, kind: "r", text: r.text, reason: r.reason })))
      .sort((a, b) => a.start - b.start);

    const parts = [];
    let cursor = 0;
    for (const sp of splices) {
      if (sp.start > cursor) parts.push({ k: "t", s: sent.text.slice(cursor, sp.start) });
      if (sp.kind === "g") parts.push({ k: "g", s: sp.text, src: { t: sp.src.title, u: sp.src.url, ty: sp.src.type }, node: sp.node, sig: sp.sig, score: sp.score, jump: sp.jump });
      else parts.push({ k: "r", s: sp.text, reason: sp.reason });
      cursor = Math.max(cursor, sp.end);
    }
    if (cursor < sent.text.length) parts.push({ k: "t", s: sent.text.slice(cursor) });

    return { parts, skeletonSource: { t: sent.source.title, u: sent.source.url } };
  });

  return { strength, headline: skeleton.sentences[0].source.title, sentences };
}

// ---- permalink ---------------------------------------------------------
//
// Unlike splicepedia/wordsplice, the encoded state here is fully rendered —
// literal text plus graft/repair metadata — not coordinates to re-fetch and
// re-derive. A shared link always reproduces exactly what was shared, even
// if the source articles are later edited or deleted, at the cost of not
// being able to drag the corruption slider further on a loaded permalink
// (see loadFromPath).

function b64urlEncode(str) {
  return btoa(unescape(encodeURIComponent(str))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(str) {
  let s = str.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  return decodeURIComponent(escape(atob(s)));
}

function encodeState(state) {
  return b64urlEncode(JSON.stringify(state));
}

function decodePath() {
  const m = /^\/a\/([A-Za-z0-9\-_]+)\/?$/.exec(location.pathname);
  if (!m) return null;
  try {
    const state = JSON.parse(b64urlDecode(m[1]));
    if (!state || !Array.isArray(state.sentences) || !state.sentences.length) return null;
    return state;
  } catch {
    return null;
  }
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
  strength: document.getElementById("strength"),
  strengthLabel: document.getElementById("strength-label"),
  strengthNote: document.getElementById("strength-note"),
  pinInput: document.getElementById("pin-input"),
  btnPinAdd: document.getElementById("btn-pin-add"),
  pinChips: document.getElementById("pin-chips"),
  typeToggles: document.querySelectorAll("#type-toggles input[type=checkbox]"),
  bias: document.getElementById("bias"),
  biasLabel: document.getElementById("bias-label"),
  sentenceCount: document.getElementById("sentence-count"),
  sentenceCountLabel: document.getElementById("sentence-count-label"),
  mixSummary: document.getElementById("mix-summary"),
};

let currentSkeleton = null; // { sentences, accepted } — null once a permalink is loaded with no live data behind it
let current = null; // last rendered state
let stitchesOn = false;
let pinnedTitles = []; // user-chosen "which articles go into the mix", see readMixControls()

// ---- splicer controls: article mix + chunk types + scoring bias ---------

function renderPinChips() {
  els.pinChips.innerHTML = pinnedTitles
    .map(
      (t) =>
        `<span class="chip">${escapeHtml(t)}<button type="button" data-title="${escapeHtml(t)}" title="Unpin" aria-label="Unpin ${escapeHtml(t)}">✕</button></span>`
    )
    .join("");
  els.btnPinAdd.disabled = pinnedTitles.length >= MAX_PINS;
  els.pinInput.disabled = pinnedTitles.length >= MAX_PINS;
  els.pinInput.placeholder = pinnedTitles.length >= MAX_PINS ? `Pinned up to the max of ${MAX_PINS}` : "Pin a Wikipedia article title…";
}

function addPin() {
  const raw = els.pinInput.value.trim();
  if (!raw || pinnedTitles.length >= MAX_PINS) return;
  if (pinnedTitles.some((t) => t.toLowerCase() === raw.toLowerCase())) { els.pinInput.value = ""; return; }
  pinnedTitles.push(raw);
  els.pinInput.value = "";
  renderPinChips();
}

function removePin(title) {
  pinnedTitles = pinnedTitles.filter((t) => t !== title);
  renderPinChips();
}

function readEnabledTypes() {
  const set = new Set();
  els.typeToggles.forEach((cb) => { if (cb.checked) set.add(cb.value); });
  return set.size ? set : new Set(GRAFTABLE_TYPES); // never let "all unchecked" silently graft nothing
}

function readVandalBias() {
  return Number(els.bias.value) || 1;
}

function readSkeletonSentenceCount() {
  return Number(els.sentenceCount.value) || SKELETON_SENTENCES_DEFAULT;
}

function updateBiasLabel() {
  els.biasLabel.textContent = `${readVandalBias().toFixed(2)}×`;
}

function updateSentenceCountLabel() {
  els.sentenceCountLabel.textContent = String(readSkeletonSentenceCount());
}

function renderMixSummary(mix) {
  if (!mix || (!mix.pinned.length && !mix.backfilled.length)) { els.mixSummary.hidden = true; return; }
  const total = mix.pinned.length + mix.backfilled.length;
  const parts = [];
  parts.push(`<strong>Mix:</strong> ${total} article${total === 1 ? "" : "s"}`);
  if (mix.pinned.length) parts.push(`${mix.pinned.length} pinned <span class="pin-tag">PIN</span>`);
  if (mix.backfilled.length) parts.push(`${mix.backfilled.length} backfilled`);
  let html = parts.join(" · ");
  if (mix.failed.length) {
    html += ` — couldn't resolve: ${mix.failed.map((t) => escapeHtml(t)).join(", ")}`;
  }
  els.mixSummary.innerHTML = html;
  els.mixSummary.hidden = false;
}

function setStatus(msg, isError) {
  els.status.textContent = msg || "";
  els.status.classList.toggle("error", !!isError);
}

function setBusy(busy) {
  els.btnRandomize.disabled = busy;
}

function bucketOf(score) {
  if (score >= 70) return "score-high";
  if (score >= 40) return "score-mid";
  return "score-low";
}

function escapeHtml(s) {
  return (s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

const NODE_LABEL = {
  NP: "noun phrase", VP: "verb phrase", PP: "prepositional phrase",
  AdjP: "adjective phrase", RelClause: "relative clause", SubClause: "subordinate clause",
};

function renderArticle(state) {
  current = state;
  const sourceTitles = new Set();
  state.sentences.forEach((s) => {
    sourceTitles.add(s.skeletonSource.t);
    s.parts.forEach((p) => { if (p.k === "g") sourceTitles.add(p.src.t); });
  });

  els.headline.textContent = state.headline;
  document.title = `${state.headline} — GraftPedia`;

  let graftCount = 0, repairCount = 0, scoreSum = 0, jumpCount = 0;
  const paraHtml = state.sentences
    .map((s, si) => {
      let html = "";
      s.parts.forEach((p, pi) => {
        const idx = `${si}-${pi}`;
        if (p.k === "t") {
          html += escapeHtml(p.s);
        } else if (p.k === "g") {
          graftCount++;
          scoreSum += p.score;
          if (p.jump) jumpCount++;
          const cls = bucketOf(p.score);
          html +=
            `<span class="graft ${cls}" data-idx="${idx}">${escapeHtml(p.s)}</span>` +
            `<sup class="stitch-mark ${cls}"><a href="#note-${idx}" title="${NODE_LABEL[p.node] || p.node} from ${escapeHtml(p.src.t)}">[${graftCount}]</a></sup>`;
        } else if (p.k === "r") {
          repairCount++;
          html += `<span class="repair" data-idx="${idx}" title="${escapeHtml(p.reason)}">${escapeHtml(p.s)}</span>`;
        }
      });
      return `<p>${html}</p>`;
    })
    .join("\n");
  els.article.innerHTML = paraHtml;
  els.article.hidden = false;

  renderInfobox({ sentenceCount: state.sentences.length, sourceCount: sourceTitles.size, graftCount, repairCount, avg: graftCount ? Math.round(scoreSum / graftCount) : 0, jumpCount });
  renderStitchNotes(state);

  els.btnStitches.disabled = false;
  els.btnShare.disabled = false;
  els.btnPermalink.disabled = false;
  applyStitchState();
}

function renderInfobox(stats) {
  els.infoboxTitle.textContent = "Graft data";
  els.infoboxBody.innerHTML = [
    ["Sentences", stats.sentenceCount],
    ["Sources spliced", stats.sourceCount],
    ["Grafts made", stats.graftCount],
    ["Auto-repairs", stats.repairCount],
    ["Avg. graft score", `${stats.avg}/100`],
    ["Ontological jumps", stats.jumpCount],
  ]
    .map(([k, v]) => `<tr><td class="k">${escapeHtml(String(k))}</td><td class="v">${v}</td></tr>`)
    .join("");
  els.infobox.hidden = false;
}

function renderStitchNotes(state) {
  const items = [];
  state.sentences.forEach((s, si) => {
    s.parts.forEach((p, pi) => {
      if (p.k !== "g" && p.k !== "r") return;
      const idx = `${si}-${pi}`;
      if (p.k === "r") {
        items.push(`<li id="note-${idx}"><strong>\u{1F527}</strong> “${escapeHtml(p.s)}” — <span class="breakdown">${escapeHtml(p.reason)}</span></li>`);
        return;
      }
      const meta = TYPE_META[p.src.ty] || TYPE_META.other;
      const cls = bucketOf(p.score);
      const srcLink = `<a href="${p.src.u}" target="_blank" rel="noopener">${escapeHtml(p.src.t)}</a>`;
      const label = NODE_LABEL[p.node] || p.node;
      items.push(
        `<li id="note-${idx}"><strong>${label}</strong> <span class="score-tag ${cls}">${p.score}/100</span> ` +
        `“${escapeHtml(p.s)}” grafted from ${srcLink} ${meta.emoji} <span class="type-pill">${meta.label}</span>` +
        (p.jump ? ` <span class="type-pill jump">ontological jump</span>` : "") +
        `<div class="breakdown">${escapeHtml(describeSig(p.node, p.sig))}</div></li>`
      );
    });
  });
  els.stitchNotes.innerHTML = items.length ? items.join("") : "<li>No grafts at this corruption strength — every sentence is unaltered real Wikipedia text.</li>";
}

function applyStitchState() {
  document.body.classList.toggle("stitches-on", stitchesOn);
  els.stitchNotes.hidden = !stitchesOn;
  els.btnStitches.textContent = stitchesOn ? "\u{1F9F5} Hide stitches" : "\u{1F9F5} Show stitches";
  els.btnStitches.classList.toggle("active", stitchesOn);
}

// ---- corruption strength ----------------------------------------------

function updateStrengthLabel(value) {
  els.strengthLabel.textContent = `${value}%`;
}

// Applies the CURRENT slider value against the already-fetched skeleton —
// no network, no re-parse, just slicing the pre-ranked graft list and
// re-rendering, so dragging the slider is instant. Slider moves ranked
// grafts already sorted best-first, so raising it always adds the NEXT most
// "optimal" graft rather than a random one.
function applyStrength(value, opts) {
  if (!currentSkeleton) return;
  const total = currentSkeleton.accepted.length;
  const count = total === 0 ? 0 : Math.max(value > 0 ? 1 : 0, Math.round((value / 100) * total));
  const applied = currentSkeleton.accepted.slice(0, count);
  const bySentence = new Map();
  for (const g of applied) {
    if (!bySentence.has(g.sentenceIdx)) bySentence.set(g.sentenceIdx, []);
    bySentence.get(g.sentenceIdx).push(g);
  }
  const state = buildState(currentSkeleton, bySentence, value);
  renderArticle(state);
  const url = "/a/" + encodeState(state);
  if (opts && opts.push) history.pushState(null, "", url);
  else history.replaceState(null, "", url);
}

// ---- sharing -----------------------------------------------------------

function buildShareText(state, url) {
  const graftCount = state.sentences.reduce((n, s) => n + s.parts.filter((p) => p.k === "g").length, 0);
  const prefix = `GraftPedia parsed "${state.headline}" into noun/verb/prepositional phrases and grafted ${graftCount} of them in from unrelated articles — grammatically correct, semantically deranged. `;
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
  setStatus("Fetching random articles from Wikipedia and parsing them into phrases…");
  setBusy(true);
  els.btnStitches.disabled = true;
  els.btnShare.disabled = true;
  els.btnPermalink.disabled = true;
  els.strength.disabled = true;
  els.strengthNote.hidden = true;
  els.mixSummary.hidden = true;
  try {
    const { articles, mix } = await gatherArticles(pinnedTitles, setStatus);
    if (!meetsThresholds(articles)) throw new Error("Wikipedia didn't return enough parseable sentences that round — try again.");
    const skeleton = buildSkeleton(articles, {
      enabledTypes: readEnabledTypes(),
      vandalWeight: readVandalBias(),
      skeletonSentences: readSkeletonSentenceCount(),
    });
    if (!skeleton || !skeleton.sentences.length) throw new Error("Couldn't build a skeleton article — try again.");
    currentSkeleton = skeleton;
    els.strength.disabled = false;
    applyStrength(Number(els.strength.value), { push: true });
    renderMixSummary(mix);
    setStatus("");
  } catch (e) {
    setStatus(String((e && e.message) || e), true);
  } finally {
    setBusy(false);
  }
}

function loadFromPath(state) {
  currentSkeleton = null;
  els.strength.value = state.strength;
  updateStrengthLabel(state.strength);
  els.strength.disabled = true;
  els.strengthNote.hidden = false;
  els.mixSummary.hidden = true;
  renderArticle(state);
  setStatus("");
}

function boot() {
  renderPinChips();
  updateBiasLabel();
  updateSentenceCountLabel();

  const state = decodePath();
  if (state) loadFromPath(state);
  else generate();

  window.addEventListener("popstate", () => {
    const s = decodePath();
    if (s) loadFromPath(s);
    else generate();
  });

  els.btnRandomize.addEventListener("click", generate);

  els.btnPinAdd.addEventListener("click", addPin);
  els.pinInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); addPin(); }
  });
  els.pinChips.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-title]");
    if (btn) removePin(btn.dataset.title);
  });

  els.bias.addEventListener("input", updateBiasLabel);
  els.sentenceCount.addEventListener("input", updateSentenceCountLabel);

  els.btnStitches.addEventListener("click", () => {
    stitchesOn = !stitchesOn;
    applyStitchState();
  });

  els.strength.addEventListener("input", () => {
    updateStrengthLabel(Number(els.strength.value));
    if (currentSkeleton) applyStrength(Number(els.strength.value), { push: false });
  });

  els.btnShare.addEventListener("click", () => {
    if (!current) return;
    const url = currentUrl();
    const text = buildShareText(current, url);
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
