import { SIMPLE } from "./words.js";

// Inverse ASD-STE100: STE restricts you to a small approved vocabulary; this
// flags every word that IS in the small vocabulary. Clean text uses only
// words from beyond it.

const SUFFIXES = ["", "s", "es", "ed", "d", "ing", "ly", "er", "est", "ies", "ied"];

// Reduce an inflected word to a candidate list of stems to check.
export function stems(word) {
  const w = word.toLowerCase().replace(/’/g, "'").replace(/'(s|re|ve|ll|d|t|m)$/, "");
  const out = new Set([w]);
  for (const suf of SUFFIXES) {
    if (suf && w.endsWith(suf) && w.length - suf.length >= 2) {
      const base = w.slice(0, -suf.length);
      out.add(base);
      out.add(base + "e");
      if (suf === "ies" || suf === "ied") out.add(base + "y");
      // doubled consonant: stopped -> stop
      if (base.length > 2 && base.at(-1) === base.at(-2)) out.add(base.slice(0, -1));
    }
  }
  return [...out];
}

export function isSimple(word, set = SIMPLE) {
  return stems(word).some((s) => set.has(s));
}

// Returns tokens in order: { text, word: bool, simple: bool }
export function lint(text, set = SIMPLE) {
  const tokens = [];
  const re = /[A-Za-z][A-Za-z'’]*|[^A-Za-z]+/g;
  let m;
  while ((m = re.exec(text))) {
    const t = m[0];
    const isWord = /^[A-Za-z]/.test(t);
    tokens.push({ text: t, word: isWord, simple: isWord && isSimple(t, set) });
  }
  return tokens;
}

export function summarize(tokens) {
  const words = tokens.filter((t) => t.word);
  const bad = words.filter((t) => t.simple);
  const clean = words.length - bad.length;
  return {
    total: words.length,
    violations: bad.length,
    clean,
    score: words.length ? Math.round((clean / words.length) * 100) : 100,
    offenders: [...new Set(bad.map((t) => t.text.toLowerCase()))],
  };
}
