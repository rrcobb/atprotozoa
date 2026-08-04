// llm-grams data — 21 curated "LLM-isms" charted as illustrative search-interest
// curves, Jan 2022 through the current month. NOT real Google Trends data (no
// API key, and no honest way to fake having one) — every curve here is
// hand-tuned to the general shape of the real story (flat before ChatGPT,
// climbing hard after Nov 2022), not measured. Said outright on the page too;
// see the methodology note in index.html.
//
// Series values are in raw "illustrative interest units" — comparable to each
// other, not to any real scale. The chart normalizes whatever's selected to
// the loudest series in the set, exactly like real Google Trends comparison
// mode, which is the whole joke once WEARING_A_TRENCHCOAT enters the picture.

(function () {
  const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  const START_YEAR = 2022;
  const START_MONTH = 0; // Jan
  const END_YEAR = 2026;
  const END_MONTH = 7; // Aug (0-indexed)
  const MONTH_COUNT = (END_YEAR - START_YEAR) * 12 + (END_MONTH - START_MONTH) + 1;

  const MONTHS = [];
  {
    let y = START_YEAR, m = START_MONTH;
    for (let i = 0; i < MONTH_COUNT; i++) {
      MONTHS.push({ i, y, m, short: MONTH_NAMES[m] + " ’" + String(y).slice(2), full: MONTH_NAMES[m] + " " + y });
      m++;
      if (m === 12) { m = 0; y++; }
    }
  }

  // Real model-release dates, used only as annotation markers on the x-axis —
  // these are the one thing on this chart that's actually true.
  const ANNOTATIONS = [
    { y: 2022, m: 10, label: "ChatGPT launches" },
    { y: 2023, m: 2, label: "GPT-4" },
    { y: 2024, m: 4, label: "GPT-4o" },
  ];

  function monthIndex(y, m) {
    return (y - START_YEAR) * 12 + (m - START_MONTH);
  }
  ANNOTATIONS.forEach((a) => { a.i = monthIndex(a.y, a.m); });

  function hashStr(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function sigmoid(x) {
    return 1 / (1 + Math.exp(-x));
  }

  // Deterministic, smooth "wiggle" so lines don't look like a bare logistic
  // curve — not real noise, just texture, seeded from the term id.
  function wiggle(seed, i) {
    return Math.sin(((seed % 97) * 0.37) + i * 1.7) * 0.5 + Math.sin(((seed % 53) * 0.19) + i * 0.9) * 0.3;
  }

  function genSeries(term) {
    const seed = hashStr(term.id);
    const base = term.baseline != null ? term.baseline : 0.04;
    const peak = term.peak;
    const takeoff = term.takeoff;
    const ramp = term.ramp;
    const vals = [];
    for (let i = 0; i < MONTH_COUNT; i++) {
      const growth = sigmoid((i - takeoff) / ramp);
      let v = base + (peak - base) * growth;
      if (term.decayAfter != null && i > term.decayAfter) {
        const decay = 1 - term.decayRate * (i - term.decayAfter);
        v *= Math.max(0.35, decay);
      }
      v += wiggle(seed, i) * peak * 0.035;
      vals.push(Math.max(0.01, v));
    }
    return vals;
  }

  // The meme term itself: flat near-nothing, then a wild last-minute spike —
  // the exact shape of the "up 5000% this month" screenshot the whole site
  // is a joke about.
  function genTrenchcoatSeries() {
    const vals = [];
    for (let i = 0; i < MONTH_COUNT; i++) {
      let v = 0.02 + wiggle(1337, i) * 0.01;
      if (i === MONTH_COUNT - 2) v = 1.6;
      if (i === MONTH_COUNT - 1) v = 46;
      vals.push(Math.max(0.01, v));
    }
    return vals;
  }

  const TERM_DEFS = [
    { id: "delve", label: "delve", category: "hedge & filler", takeoff: 10, ramp: 3.2, peak: 1.0,
      blurb: "the flagship tell. barely moved for a decade, then went vertical the week ChatGPT shipped." },
    { id: "delve-into", label: "delve into", category: "hedge & filler", takeoff: 10, ramp: 3.6, peak: 0.86,
      blurb: "delve's chattier cousin — always needs an object to delve into." },
    { id: "tapestry", label: "rich tapestry", category: "cliché phrase", takeoff: 11, ramp: 4.2, peak: 0.8,
      blurb: "everything is woven into one now, apparently." },
    { id: "boasts", label: "boasts", category: "hedge & filler", takeoff: 12, ramp: 4.8, peak: 0.62,
      blurb: "products no longer 'have' features. they boast them." },
    { id: "testament-to", label: "a testament to", category: "cliché phrase", takeoff: 13, ramp: 4.2, peak: 0.56,
      blurb: "the go-to closer when nothing else lands." },
    { id: "moreover", label: "moreover", category: "transition", takeoff: 10, ramp: 2.6, peak: 0.5, decayAfter: 34, decayRate: 0.012,
      blurb: "peaked early, now quietly getting prompted out of everyone's style guide." },
    { id: "furthermore", label: "furthermore", category: "transition", takeoff: 10, ramp: 2.6, peak: 0.46, decayAfter: 34, decayRate: 0.012,
      blurb: "moreover's twin. same rise, same slow retreat." },
    { id: "navigating", label: "navigating", category: "hedge & filler", takeoff: 14, ramp: 5.5, peak: 0.7,
      blurb: "nobody deals with anything anymore. they navigate it." },
    { id: "landscape", label: "the landscape of", category: "cliché phrase", takeoff: 12, ramp: 5.2, peak: 0.76,
      blurb: "every field is a landscape now, ever-evolving, never just a field." },
    { id: "unlock", label: "unlock", category: "hedge & filler", takeoff: 15, ramp: 5.2, peak: 0.66,
      blurb: "the verb for when 'use' felt too plain." },
    { id: "elevate", label: "elevate", category: "hedge & filler", takeoff: 16, ramp: 5.5, peak: 0.56,
      blurb: "marketing copy's favorite, adopted wholesale." },
    { id: "game-changer", label: "game-changer", category: "cliché phrase", takeoff: 9, ramp: 3.8, peak: 0.6,
      blurb: "pre-existing cliche, given a huge second wind." },
    { id: "not-x-its-y", label: "it's not just X, it's Y", category: "structure", takeoff: 18, ramp: 5.5, peak: 0.56,
      blurb: "the rhetorical move that ate marketing copy, then everything else." },
    { id: "fast-paced-world", label: "in today's fast-paced world", category: "cliché phrase", takeoff: 8, ramp: 2.8, peak: 0.36, decayAfter: 30, decayRate: 0.02,
      blurb: "so overused it got mocked into a quick decline. a rare comeback story, in reverse." },
    { id: "robust", label: "robust", category: "hedge & filler", takeoff: 12, ramp: 4.4, peak: 0.52,
      blurb: "nothing is just 'good' anymore." },
    { id: "seamless", label: "seamless", category: "hedge & filler", takeoff: 13, ramp: 5.0, peak: 0.56,
      blurb: "every experience is now seamless, whether or not it seams." },
    { id: "leverage", label: "leverage (verb)", category: "hedge & filler", takeoff: 11, ramp: 4.4, peak: 0.62,
      blurb: "already a corporate favorite; the models just kept it warm." },
    { id: "crucial", label: "crucial", category: "hedge & filler", takeoff: 12, ramp: 4.4, peak: 0.46,
      blurb: "important's more italicized understudy." },
    { id: "multifaceted", label: "multifaceted", category: "hedge & filler", takeoff: 18, ramp: 5.5, peak: 0.36,
      blurb: "used whenever an answer doesn't want to pick a side." },
    { id: "paradigm-shift", label: "paradigm shift", category: "cliché phrase", takeoff: 10, ramp: 4.2, peak: 0.46,
      blurb: "everything is one now, several times a week." },
    { id: "trenchcoat", label: "wearing a trenchcoat", category: "the discourse itself", peak: 46, meme: true,
      blurb: "the reason this site exists. add it and watch it eat every other line — that's not a bug, that's what a real Trends comparison does too." },
  ];

  const SERIES = {};
  TERM_DEFS.forEach((t) => {
    SERIES[t.id] = t.meme ? genTrenchcoatSeries() : genSeries(t);
  });

  window.LLMGRAMS = {
    MONTHS,
    MONTH_COUNT,
    ANNOTATIONS,
    TERM_DEFS,
    SERIES,
    hashStr,
  };
})();
