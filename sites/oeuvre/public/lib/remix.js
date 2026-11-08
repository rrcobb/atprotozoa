// remix.js — the oeuvre engine, pure functions (no DOM, no network) so it can be
// tested under node. No model, no inference: it is a mad-lib.
//
//   style     = a post of account A with its "content runs" cut out. Function
//               words, casing, punctuation, emoji, line breaks and rhythm stay.
//   substance = the content runs (consecutive non-function words) that account B
//               actually writes, drawn with their natural frequency, so B's
//               recurring subjects dominate.
//
// A word is a "function word" if it is in the stoplist below, or if it is one of
// A's own most common words (HABIT_WORDS): the words someone leans on constantly
// are their voice rather than their subject. 120 is a modelling choice, not a
// data cap — every post of both accounts is still read. A word also has to
// appear HABIT_MIN times to count as a habit, or a small account would be all
// habit and have nothing left to swap.

const HABIT_WORDS = 120;
const HABIT_MIN = 3;

const STOP = new Set(`a about above after again all also am an and any are aren't as at be because been before being below between both but by can can't cannot could couldn't did didn't do does doesn't doing don't down during each few for from further had hadn't has hasn't have haven't having he he'd he'll he's her here here's hers herself him himself his how how's i i'd i'll i'm i've if in into is isn't it it's its itself let's me more most mustn't my myself no nor not of off on once only or other ought our ours ourselves out over own same shan't she she'd she'll she's should shouldn't so some such than that that's the their theirs them themselves then there there's these they they'd they'll they're they've this those through to too under until up very was wasn't we we'd we'll we're we've were weren't what what's when when's where where's which while who who's whom why why's with won't would wouldn't you you'd you'll you're you've your yours yourself yourselves
just like really im ive dont cant thats its got get gets getting go goes going gone one now yeah yes oh ok okay lol lmao haha hey well even still much many may might must will shall yet ever never always maybe sure too then than thing things way`.split(/\s+/));

const TOKEN_RE = /#?[\p{L}\p{N}][\p{L}\p{N}'’_-]*|\s+|[^\s\p{L}\p{N}]+/gu;
const MAX_RUN = 4; // a run longer than this is split, so a long noun pile can't swallow a whole post

export function cleanText(text) {
  return String(text || "")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/(^|\s)@[\w.-]+/g, "$1")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .trim();
}

export function tokenize(text) {
  const out = [];
  for (const m of text.matchAll(TOKEN_RE)) {
    const s = m[0];
    const kind = /^\s+$/.test(s) ? "space" : /^#?[\p{L}\p{N}]/u.test(s) ? "word" : "punct";
    out.push({ s, kind, low: kind === "word" ? s.toLowerCase().replace(/’/g, "'") : "" });
  }
  return out;
}

const bare = (w) => w.replace(/^#/, "");
const isHashtag = (w) => w.startsWith("#");

// Counts every word across a list of cleaned posts and returns A's habit set.
export function habitWords(texts) {
  const counts = new Map();
  for (const t of texts) for (const tk of tokenize(t)) if (tk.kind === "word" && !isHashtag(tk.low)) counts.set(tk.low, (counts.get(tk.low) || 0) + 1);
  return new Set([...counts].filter((e) => e[1] >= HABIT_MIN).sort((a, b) => b[1] - a[1]).slice(0, HABIT_WORDS).map((e) => e[0]));
}

function isContent(tk, habits) {
  if (tk.kind !== "word") return false;
  if (isHashtag(tk.low)) return true;
  const w = tk.low;
  if (habits && habits.has(w)) return false;
  if (STOP.has(w)) return false;
  return bare(w).length >= 2;
}

// Group a token list into [{ type: "fixed"|"run", toks }] — a run is consecutive
// content words joined only by plain single-line spaces.
function segment(toks, habits) {
  const segs = [];
  let i = 0;
  while (i < toks.length) {
    if (isContent(toks[i], habits)) {
      const run = [toks[i]];
      let j = i + 1;
      while (j + 1 < toks.length && toks[j].kind === "space" && !toks[j].s.includes("\n") && isContent(toks[j + 1], habits)) {
        run.push(toks[j], toks[j + 1]);
        j += 2;
      }
      // split over-long runs into MAX_RUN-word pieces
      const words = run.filter((t) => t.kind === "word");
      for (let k = 0; k < words.length; k += MAX_RUN) segs.push({ type: "run", words: words.slice(k, k + MAX_RUN) });
      i = j;
    } else {
      const last = segs[segs.length - 1];
      if (last && last.type === "fixed") last.toks.push(toks[i]);
      else segs.push({ type: "fixed", toks: [toks[i]] });
      i++;
    }
  }
  return segs;
}

const startsSentence = (prevText) => /(^|[.!?]\s*|\n\s*)$/.test(prevText);

// B's substance: every content run, normalised to lowercase with a flag for
// "this was capitalised mid-sentence" (a name) or ALL CAPS.
export function harvestSubstance(texts, habits = new Set()) {
  const buckets = { 1: [], 2: [], 3: [], 4: [] };
  const counts = new Map();
  for (const text of texts) {
    const toks = tokenize(text);
    let before = "";
    for (const seg of segment(toks, habits)) {
      if (seg.type === "fixed") { before += seg.toks.map((t) => t.s).join(""); continue; }
      const words = seg.words.map((w) => w.s);
      const first = words[0];
      const lead = startsSentence(before);
      const caps = words.every((w) => w.length > 1 && w === w.toUpperCase() && w !== w.toLowerCase());
      const proper = !caps && !lead && /^\p{Lu}/u.test(bare(first));
      const phrase = words.join(" ");
      const item = { text: caps || proper ? phrase : phrase.toLowerCase(), caps, proper };
      if (!caps && !proper) item.text = phrase.toLowerCase();
      if (caps) item.text = phrase;
      buckets[words.length].push(item);
      const key = phrase.toLowerCase();
      counts.set(key, (counts.get(key) || 0) + 1);
      before += phrase + " ";
    }
  }
  return { buckets, counts, total: Object.values(buckets).reduce((n, b) => n + b.length, 0) };
}

// A's style skeletons: posts that still have at least one slot after cutting.
export function harvestStyle(texts, habits) {
  const skeletons = [];
  for (const text of texts) {
    const segs = segment(tokenize(text), habits);
    const runs = segs.filter((s) => s.type === "run").length;
    if (!runs) continue;
    skeletons.push({ text, segs });
  }
  return skeletons;
}

// Letters-only casing of a post: "lower" if it has letters and none uppercase.
export function casingOf(texts) {
  let lower = 0, n = 0;
  for (const t of texts) {
    if (!/\p{L}/u.test(t)) continue;
    n++;
    if (!/\p{Lu}/u.test(t)) lower++;
  }
  return { lowerShare: n ? lower / n : 0, posts: n };
}

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const cap = (s) => s.replace(/^(\P{L}*)(\p{L})/u, (_, p, c) => p + c.toUpperCase());
const titleCase = (s) => s.split(" ").map(cap).join(" ");

function draw(substance, len, rand, used) {
  // nearest non-empty length bucket, preferring the requested one
  const order = [len, len - 1, len + 1, len - 2, len + 2, 1, 2, 3, 4].filter((l) => l >= 1 && l <= MAX_RUN);
  for (const l of order) {
    const b = substance.buckets[l];
    if (!b.length) continue;
    for (let tries = 0; tries < 12; tries++) {
      const it = b[Math.floor(rand() * b.length)];
      if (!used.has(it.text.toLowerCase())) { used.add(it.text.toLowerCase()); return it; }
    }
    return b[Math.floor(rand() * b.length)];
  }
  return null;
}

// Fill one skeleton with substance. `lowerStyle` = A writes in lowercase.
export function fill(skel, substance, rand, lowerStyle) {
  const used = new Set();
  let out = "";
  for (const seg of skel.segs) {
    if (seg.type === "fixed") { out += seg.toks.map((t) => t.s).join(""); continue; }
    const orig = seg.words.map((w) => w.s).join(" ");
    const it = draw(substance, seg.words.length, rand, used);
    if (!it) { out += orig; continue; }
    const lead = startsSentence(out);
    const origCaps = seg.words.every((w) => w.s.length > 1 && w.s === w.s.toUpperCase() && w.s !== w.s.toLowerCase());
    const origTitle = !lead && /^\p{Lu}/u.test(bare(seg.words[0].s));
    let s = it.text;
    if (origCaps) s = s.toUpperCase();
    else if (lowerStyle) s = s.toLowerCase();
    else if (it.caps) s = s;
    else if (it.proper || origTitle) s = titleCase(s);
    else if (lead) s = cap(s);
    out += s;
  }
  return out.trim();
}

export function harvest({ styleTexts, substanceTexts, count = 12, seed = 1 }) {
  const habits = habitWords(styleTexts);
  const lowerStyle = casingOf(styleTexts).lowerShare >= 0.6;
  const substance = harvestSubstance(substanceTexts, habits);
  const skeletons = harvestStyle(styleTexts, habits);
  if (!skeletons.length) throw new Error("the style account has no posts with anything to swap out");
  if (!substance.total) throw new Error("the substance account has no usable subject matter");
  const rand = mulberry32(seed);
  const works = [];
  const seen = new Set();
  // shuffled walk through skeletons so one account's posts aren't reused until all are
  let pool = [];
  let guard = 0;
  while (works.length < count && guard++ < count * 40) {
    if (!pool.length) pool = skeletons.map((_, i) => i).sort(() => rand() - 0.5);
    const skel = skeletons[pool.pop()];
    const text = fill(skel, substance, rand, lowerStyle);
    if (!text || seen.has(text) || text.length < 8) continue;
    seen.add(text);
    works.push({ text, from: skel.text });
  }
  return { works, habits, substance, lowerStyle, skeletons: skeletons.length };
}

// Style fingerprint of A for the "what was kept" panel.
export function fingerprint(texts) {
  const words = texts.reduce((n, t) => n + tokenize(t).filter((x) => x.kind === "word").length, 0);
  const emoji = new Map(), opener = new Map(), ending = new Map();
  for (const t of texts) {
    for (const m of t.matchAll(/\p{Extended_Pictographic}/gu)) emoji.set(m[0], (emoji.get(m[0]) || 0) + 1);
    const w = tokenize(t).find((x) => x.kind === "word");
    if (w) opener.set(w.low, (opener.get(w.low) || 0) + 1);
    const e = /(\.\.\.|…|[.!?]+|\p{Extended_Pictographic})\s*$/u.exec(t);
    const k = e ? e[1] : "(none)";
    ending.set(k, (ending.get(k) || 0) + 1);
  }
  const top = (m, n) => [...m].sort((a, b) => b[1] - a[1]).slice(0, n);
  return {
    posts: texts.length,
    avgWords: texts.length ? words / texts.length : 0,
    lowerShare: casingOf(texts).lowerShare,
    emoji: top(emoji, 6), openers: top(opener, 5), endings: top(ending, 4),
  };
}
