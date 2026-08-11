// ceemilarity's analysis engine — ceemilarity.bisks.net
//
// Built for @cee.wtf, who asked for a page that analyzes their posting habits,
// writing style, and grammar quirks, then lets anyone check how close their
// own style lands to it. This file does the actual measuring: turn a list of
// { text, createdAt, isReply } posts into a "style profile" (a bag of
// heuristics — sentence length, punctuation habits, capitalization, emoji
// use, posting schedule, vocabulary richness, and more), then compare two
// profiles into a single similarity score plus a per-heuristic breakdown.
//
// Plain data in, plain data out — no network calls in this file. Runs
// unmodified in the browser (public/index.html) AND under plain Node
// (scripts/build-profile.js, which bakes cee's own profile into
// public/data/cee-profile.json at build time) via the UMD wrapper below.
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.StyleEngine = factory();
})(typeof self !== "undefined" ? self : this, function () {
  const segmenter =
    typeof Intl !== "undefined" && Intl.Segmenter ? new Intl.Segmenter("en", { granularity: "grapheme" }) : null;
  function graphemeLength(text) {
    if (!text) return 0;
    if (segmenter) return [...segmenter.segment(text)].length;
    return Array.from(text).length;
  }

  const URL_RE = /https?:\/\/\S+/g;
  const WORD_RE = /[\p{L}\p{N}]+(?:['’][\p{L}]+)*/gu;
  const CONTRACTION_RE = /\b\p{L}+['’]\p{L}+\b/gu;
  const HASHTAG_RE = /#[\p{L}\p{N}_]+/gu;
  const MENTION_RE = /@[a-zA-Z0-9.\-]+/g;
  const EMOJI_RE = /\p{Extended_Pictographic}/gu;
  const SLANG_RE = /\b(lo+l|lma+o|lmfao+|ha+ha+|he+he+|omg+|tbh|ngl|imo|fr+|idk|smh)\b/giu;
  const ELLIPSIS_RE = /\.\.\.|…/g;
  const EMDASH_RE = /[—–]|--/g;
  const SENTENCE_SPLIT_RE = /[.!?…]+(?:\s+|$)/gu;
  const SEMICOLON_RE = /;/g;
  const DOUBLE_SPACE_RE = /[^\S\n]{2,}/g;
  const CURLY_RE = /[’‘“”]/;

  function stripLinks(text) {
    return text.replace(URL_RE, " ");
  }

  function words(text) {
    return stripLinks(text).match(WORD_RE) || [];
  }

  function sentences(text) {
    const t = stripLinks(text).trim();
    if (!t) return [];
    return t
      .split(SENTENCE_SPLIT_RE)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  function firstLetter(text) {
    const m = text.match(/\p{L}/u);
    return m ? m[0] : null;
  }

  function terminalPunct(text) {
    const t = text.trim();
    if (!t) return "none";
    if (/(\.\.\.|…)\s*$/.test(t)) return "ellipsis";
    const last = t[t.length - 1];
    if (last === "!") return "exclaim";
    if (last === "?") return "question";
    if (last === ".") return "period";
    if (/\p{L}|\p{N}/u.test(last)) return "none";
    return "other";
  }

  function firstWord(text) {
    const ws = words(text);
    return ws.length ? ws[0].toLowerCase() : null;
  }

  // Adjacent lowercase word pairs — surfaces recurring signature phrases
  // ("no thoughts head", "kind of just") that single-word frequency misses,
  // since a catchphrase's individual words are often too common on their own.
  function bigramsOf(lowerWords) {
    const out = [];
    for (let i = 0; i < lowerWords.length - 1; i++) out.push(lowerWords[i] + " " + lowerWords[i + 1]);
    return out;
  }

  const STOPWORDS = new Set(
    "the a an and or but so if of to in on for with at by from is are was were be been being this that it i you he she we they my your his her its our their as not no do does did have has had just like it's im i'm dont don't its it's".split(
      " "
    )
  );

  // Extracts a per-post feature record. Everything downstream aggregates
  // over an array of these.
  function extractPost(p) {
    const text = p.text || "";
    const w = words(text);
    const s = sentences(text);
    const fl = firstLetter(text);
    const created = p.createdAt ? new Date(p.createdAt) : null;
    const lower = w.map((x) => x.toLowerCase());
    return {
      length: graphemeLength(text),
      wordCount: w.length,
      sentenceCount: s.length || (w.length ? 1 : 0),
      startsLower: fl ? fl === fl.toLowerCase() && fl !== fl.toUpperCase() : null,
      allCapsWords: w.filter((x) => x.length >= 2 && x === x.toUpperCase() && x !== x.toLowerCase()).length,
      exclaimCount: (text.match(/!/g) || []).length,
      questionCount: (text.match(/\?/g) || []).length,
      ellipsisCount: (text.match(ELLIPSIS_RE) || []).length,
      emDashCount: (text.match(EMDASH_RE) || []).length,
      emojiCount: (text.match(EMOJI_RE) || []).length,
      hashtagCount: (text.match(HASHTAG_RE) || []).length,
      mentionCount: (text.match(MENTION_RE) || []).length,
      contractionCount: (text.match(CONTRACTION_RE) || []).length,
      slangCount: (text.match(SLANG_RE) || []).length,
      semicolonCount: (text.match(SEMICOLON_RE) || []).length,
      doubleSpaceCount: (text.match(DOUBLE_SPACE_RE) || []).length,
      hasCurlyQuote: CURLY_RE.test(text),
      runOn: w.length >= 30 && (s.length || 0) <= 1,
      hasParens: /\([^)]*\)/.test(text),
      hasNewline: /\n/.test(text),
      terminal: terminalPunct(text),
      firstWord: firstWord(text),
      words: lower,
      bigrams: bigramsOf(lower),
      isReply: !!p.isReply,
      hour: created ? created.getUTCHours() : null,
      weekday: created ? created.getUTCDay() : null,
    };
  }

  function median(nums) {
    if (!nums.length) return 0;
    const s = [...nums].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  }

  function clamp01(v) {
    return Math.max(0, Math.min(1, v));
  }

  // Builds a full style profile: raw human-readable stats, a normalized
  // feature vector (0..1 per axis) used for comparison, and "quirks" —
  // extra texture (top emoji, top words, sentence starters, schedule) shown
  // in the report but not folded into the score.
  function analyze(rawPosts) {
    const posts = (rawPosts || []).filter((p) => p && p.text && p.text.trim()).map(extractPost);
    const n = posts.length || 1;

    const sum = (fn) => posts.reduce((a, p) => a + fn(p), 0);
    const totalWords = sum((p) => p.wordCount) || 1;
    const totalPosts = posts.length;

    const avgLength = sum((p) => p.length) / n;
    const medianLength = median(posts.map((p) => p.length));
    const avgWordsPerSentence = sum((p) => p.wordCount) / Math.max(1, sum((p) => p.sentenceCount));
    const avgWordLength =
      posts.reduce((a, p) => a + p.words.reduce((b, w) => b + w.length, 0), 0) / totalWords;

    const lowerStartable = posts.filter((p) => p.startsLower !== null);
    const lowercaseStartRatio = lowerStartable.length
      ? lowerStartable.filter((p) => p.startsLower).length / lowerStartable.length
      : 0;

    const allCapsWordRatio = sum((p) => p.allCapsWords) / totalWords;
    const exclaimPer100Words = (sum((p) => p.exclaimCount) / totalWords) * 100;
    const questionPer100Words = (sum((p) => p.questionCount) / totalWords) * 100;
    const ellipsisPer100Posts = (sum((p) => p.ellipsisCount) / n) * 100;
    const emDashPer100Posts = (sum((p) => p.emDashCount) / n) * 100;
    const emojiPerPost = sum((p) => p.emojiCount) / n;
    const hashtagPerPost = sum((p) => p.hashtagCount) / n;
    const mentionPerPost = sum((p) => p.mentionCount) / n;
    const contractionPer100Words = (sum((p) => p.contractionCount) / totalWords) * 100;
    const slangPer100Posts = (sum((p) => p.slangCount) / n) * 100;
    const parensRatio = posts.filter((p) => p.hasParens).length / n;
    const multiLineRatio = posts.filter((p) => p.hasNewline).length / n;
    const replyRatio = posts.filter((p) => p.isReply).length / n;
    const semicolonPer100Posts = (sum((p) => p.semicolonCount) / n) * 100;
    const doubleSpacePer100Posts = (sum((p) => p.doubleSpaceCount) / n) * 100;
    const curlyQuoteRatio = posts.filter((p) => p.hasCurlyQuote).length / n;
    const runOnRatio = posts.filter((p) => p.runOn).length / n;

    const typeTokenSample = posts.flatMap((p) => p.words).slice(0, 20000);
    const uniqueWords = new Set(typeTokenSample);
    const typeTokenRatio = typeTokenSample.length ? uniqueWords.size / typeTokenSample.length : 0;

    const terminalCounts = { period: 0, exclaim: 0, question: 0, ellipsis: 0, none: 0, other: 0 };
    posts.forEach((p) => terminalCounts[p.terminal]++);
    const terminalPct = {};
    Object.keys(terminalCounts).forEach((k) => (terminalPct[k] = (terminalCounts[k] / n) * 100));

    const hourHistogram = new Array(24).fill(0);
    const weekdayHistogram = new Array(7).fill(0);
    let timedPosts = 0;
    posts.forEach((p) => {
      if (p.hour !== null) {
        hourHistogram[p.hour]++;
        weekdayHistogram[p.weekday]++;
        timedPosts++;
      }
    });
    const hourDist = timedPosts ? hourHistogram.map((c) => c / timedPosts) : hourHistogram;
    const weekdayDist = timedPosts ? weekdayHistogram.map((c) => c / timedPosts) : weekdayHistogram;

    // word/emoji frequency, stopwords excluded from the word list
    const wordFreq = new Map();
    posts.forEach((p) =>
      p.words.forEach((w) => {
        if (w.length < 3 || STOPWORDS.has(w)) return;
        wordFreq.set(w, (wordFreq.get(w) || 0) + 1);
      })
    );
    const topWords = [...wordFreq.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([word, count]) => ({ word, count }));

    const emojiFreq = new Map();
    (rawPosts || []).forEach((p) => {
      const found = (p.text || "").match(EMOJI_RE) || [];
      found.forEach((e) => emojiFreq.set(e, (emojiFreq.get(e) || 0) + 1));
    });
    const topEmoji = [...emojiFreq.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([emoji, count]) => ({ emoji, count }));

    const starterFreq = new Map();
    posts.forEach((p) => {
      if (!p.firstWord) return;
      starterFreq.set(p.firstWord, (starterFreq.get(p.firstWord) || 0) + 1);
    });
    const topStarters = [...starterFreq.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([word, count]) => ({ word, count }));

    // Signature phrases — a bigram needs to recur at least 3 times to count
    // as a "quirk" rather than coincidence, and single-stopword pairs like
    // "of the" are excluded so what surfaces is closer to a real catchphrase.
    const bigramFreq = new Map();
    posts.forEach((p) =>
      p.bigrams.forEach((bg) => {
        const [w1, w2] = bg.split(" ");
        if (STOPWORDS.has(w1) && STOPWORDS.has(w2)) return;
        bigramFreq.set(bg, (bigramFreq.get(bg) || 0) + 1);
      })
    );
    const topBigrams = [...bigramFreq.entries()]
      .filter(([, count]) => count >= 3)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([phrase, count]) => ({ phrase, count }));

    const raw = {
      totalPosts,
      avgLength,
      medianLength,
      avgWordsPerSentence,
      avgWordLength,
      lowercaseStartRatio,
      allCapsWordRatio,
      exclaimPer100Words,
      questionPer100Words,
      ellipsisPer100Posts,
      emDashPer100Posts,
      emojiPerPost,
      hashtagPerPost,
      mentionPerPost,
      contractionPer100Words,
      slangPer100Posts,
      parensRatio,
      multiLineRatio,
      replyRatio,
      typeTokenRatio,
      semicolonPer100Posts,
      doubleSpacePer100Posts,
      curlyQuoteRatio,
      runOnRatio,
    };

    // Normalized 0..1 vector — scales picked from a broad read of real
    // Bluesky posting behavior, not tuned to any one account. See FEATURES
    // below for the scale each axis saturates at.
    const vector = {};
    FEATURES.forEach((f) => {
      if (f.kind !== "scalar") return;
      vector[f.key] = clamp01(raw[f.key] / f.scale);
    });

    return {
      raw,
      vector,
      hourDist,
      weekdayDist,
      terminalPct,
      quirks: { topWords, topEmoji, topStarters, topBigrams },
    };
  }

  // The comparable axes. `scale` is the raw value that maps to a normalized
  // 1.0 (saturating, not a hard clamp cliff) — picked so a real difference
  // shows up as a real gap, not everyone pinned at the ceiling.
  const FEATURES = [
    { key: "avgLength", kind: "scalar", label: "post length", unit: "chars", scale: 300, weight: 1.1 },
    { key: "avgWordsPerSentence", kind: "scalar", label: "sentence length", unit: "words", scale: 28, weight: 1 },
    { key: "avgWordLength", kind: "scalar", label: "word length", unit: "chars", scale: 7, weight: 0.6 },
    { key: "lowercaseStartRatio", kind: "scalar", label: "starts lowercase", unit: "%", scale: 1, weight: 1.1, pct: true },
    { key: "allCapsWordRatio", kind: "scalar", label: "ALL CAPS words", unit: "%", scale: 0.06, weight: 0.7, pct: true },
    { key: "exclaimPer100Words", kind: "scalar", label: "exclamation marks", unit: "/100w", scale: 6, weight: 0.9 },
    { key: "questionPer100Words", kind: "scalar", label: "question marks", unit: "/100w", scale: 4, weight: 0.7 },
    { key: "ellipsisPer100Posts", kind: "scalar", label: "ellipses (…)", unit: "/100 posts", scale: 40, weight: 0.8 },
    { key: "emDashPer100Posts", kind: "scalar", label: "em dashes (—)", unit: "/100 posts", scale: 40, weight: 0.9 },
    { key: "emojiPerPost", kind: "scalar", label: "emoji use", unit: "/post", scale: 1.2, weight: 1 },
    { key: "hashtagPerPost", kind: "scalar", label: "hashtag use", unit: "/post", scale: 0.5, weight: 0.5 },
    { key: "mentionPerPost", kind: "scalar", label: "@mentions", unit: "/post", scale: 0.6, weight: 0.5 },
    { key: "contractionPer100Words", kind: "scalar", label: "contractions", unit: "/100w", scale: 8, weight: 0.8 },
    { key: "slangPer100Posts", kind: "scalar", label: "lol/omg/ngl energy", unit: "/100 posts", scale: 25, weight: 0.7 },
    { key: "parensRatio", kind: "scalar", label: "(parentheticals)", unit: "%", scale: 0.35, weight: 0.6, pct: true },
    { key: "multiLineRatio", kind: "scalar", label: "multi-line posts", unit: "%", scale: 0.5, weight: 0.6, pct: true },
    { key: "replyRatio", kind: "scalar", label: "replies vs top-level", unit: "%", scale: 1, weight: 0.7, pct: true },
    { key: "typeTokenRatio", kind: "scalar", label: "vocabulary richness", unit: "", scale: 0.5, weight: 0.8 },
    { key: "semicolonPer100Posts", kind: "scalar", label: "semicolons", unit: "/100 posts", scale: 8, weight: 0.4 },
    { key: "doubleSpacePer100Posts", kind: "scalar", label: "double spacing", unit: "/100 posts", scale: 30, weight: 0.3 },
    { key: "curlyQuoteRatio", kind: "scalar", label: "curly quotes/apostrophes", unit: "%", scale: 1, weight: 0.4, pct: true },
    { key: "runOnRatio", kind: "scalar", label: "run-on posts", unit: "%", scale: 0.3, weight: 0.5, pct: true },
    { key: "schedule", kind: "dist", label: "posting-hour rhythm", unit: "", weight: 0.9 },
  ];

  function distSimilarity(a, b) {
    // 1 - total variation distance: 1.0 for identical histograms, 0 for
    // disjoint support.
    let tv = 0;
    for (let i = 0; i < a.length; i++) tv += Math.abs((a[i] || 0) - (b[i] || 0));
    return clamp01(1 - tv / 2);
  }

  function fmtFeature(f, rawVal) {
    if (rawVal === undefined || rawVal === null || Number.isNaN(rawVal)) return "—";
    if (f.pct) return (rawVal * 100).toFixed(1) + "%";
    if (f.unit === "chars" || f.unit === "words") return rawVal.toFixed(1) + " " + f.unit;
    if (f.unit) return rawVal.toFixed(2) + " " + f.unit;
    return rawVal.toFixed(2);
  }

  // Raw per-feature match (1 - normalized delta) turned out to cluster
  // everyone in the 80-95% band, even total strangers — most FEATURES scales
  // saturate well past the range real accounts actually spread across, so a
  // meaningful gap shows up as only a small normalized delta. Sampled a few
  // real accounts against cee's baseline (@bisks.net's "tune your heuristics"
  // ask) and found three unrelated people landing at 86-90% overall —
  // "Basically the Same Person" territory for accounts that don't actually
  // read alike. MATCH_STEEPNESS pushes match^p before weighting: p=1 leaves
  // the raw clustering; higher p leaves near-identical features (match
  // near 1) mostly alone while pulling genuinely-different ones (match
  // solidly below 1) down harder, so the same three accounts land at a more
  // honest ~70-76% and self-comparison still hits exactly 100%.
  const MATCH_STEEPNESS = 3;

  // Compares two profiles (from analyze()) into an overall similarity score
  // and a per-feature breakdown, most-different features first (that's the
  // interesting part of a report like this).
  function compare(you, them) {
    const rows = FEATURES.map((f) => {
      let match, youDisplay, themDisplay;
      if (f.kind === "dist") {
        match = distSimilarity(you.hourDist, them.hourDist);
        youDisplay = "—";
        themDisplay = "—";
      } else {
        const a = you.vector[f.key] ?? 0;
        const b = them.vector[f.key] ?? 0;
        match = clamp01(1 - Math.abs(a - b));
        youDisplay = fmtFeature(f, you.raw[f.key]);
        themDisplay = fmtFeature(f, them.raw[f.key]);
      }
      match = Math.pow(match, MATCH_STEEPNESS);
      return { key: f.key, label: f.label, weight: f.weight, matchPct: match * 100, you: youDisplay, them: themDisplay };
    });

    const totalWeight = FEATURES.reduce((a, f) => a + f.weight, 0);
    const overall = rows.reduce((a, r, i) => a + r.matchPct * FEATURES[i].weight, 0) / totalWeight;

    const sorted = [...rows].sort((a, b) => a.matchPct - b.matchPct);
    return { overall, rows, mostDifferent: sorted.slice(0, 3), mostAlike: sorted.slice(-3).reverse() };
  }

  function verdictFor(overall) {
    if (overall >= 85) return { label: "Basically the Same Person", blurb: "uncanny. either you two are converging on something, or one of you is a fork." };
    if (overall >= 70) return { label: "Style Siblings", blurb: "different voices, same neighborhood. a lot of the same instincts show up in the numbers." };
    if (overall >= 55) return { label: "Kindred-ish", blurb: "some real overlap, some real gaps. you'd get along, you wouldn't be mistaken for each other." };
    if (overall >= 35) return { label: "Parallel Timelines", blurb: "you're both posting, technically on the same website, in the same language, probably." };
    return { label: "Total Opposites", blurb: "wildly different rhythm. if there's a spectrum of Bluesky posting styles, you're on opposite ends of it." };
  }

  return { analyze, compare, verdictFor, graphemeLength, FEATURES, words, sentences };
});
