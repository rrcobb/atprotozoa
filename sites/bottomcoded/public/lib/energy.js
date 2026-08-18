// energy.js — the "bottom ↔ top posting energy" heuristic.
//
// Not a real personality test. Scores raw post text for assertive,
// declarative, no-hedging phrasing ("top" signals) versus apologetic,
// question-heavy, softened phrasing ("bottom" signals), tallies it across a
// handle's latest ~100 authored posts, and averages. It's a bit, built off a
// thread where @fubarchitect.com described noticing their own "bottom coded"
// skeets — see the quote on the page.
//
// Kept as a plain object of weighted regexes so src/index.ts can carry an
// identical copy for the server-rendered /s/<handle> share route (see that
// file's comment — same reasoning as sites/didscope).

export const TOP_SIGNALS = [
  [/\bi said what i said\b/, 1.6, "“i said what i said”"],
  [/\bnot (?:up for debate|negotiable)\b/, 1.3, "not up for debate"],
  [/\bthe audacity\b/, 0.9, "the audacity"],
  [/\bfix (?:it|your(?:self)?)\b/, 1.0, "fix it"],
  [/\bdo better\b/, 1.0, "do better"],
  [/\bfull stop\b/, 0.9, "full stop"],
  [/\bcouldn'?t be me\b/, 0.7, "couldn't be me"],
  [/\byou will\b/, 0.5, "you will"],
  [/^no[.,]/, 0.7, "blunt “no.” opener"],
  [/^(?:do|stop|get|move|fix|listen|watch|try|quit)\b/, 0.5, "imperative opener"],
  [/\bobviously\b/, 0.6, "obviously"],
  [/\bcorrect(?:ly)?\b/, 0.3, "correct"],
  [/\bactually\b/, 0.25, "actually"],
  [/\bliterally\b/, 0.25, "literally"],
];

export const BOTTOM_SIGNALS = [
  [/\bbottom[\s-]?coded\b/, 1.6, "“bottom coded”"],
  [/\bouchies?\b/, 1.0, "ouchies"],
  [/\bouch\b/, 0.6, "ouch"],
  [/\bno thoughts\b/, 0.6, "“no thoughts”"],
  [/\bi can'?t believe i (?:said|did) that\b/, 0.6, "“i can't believe i said that”"],
  [/\basking for a friend\b/, 0.5, "asking for a friend"],
  [/\bif that'?s (?:ok|okay|alright)\b/, 0.5, "“if that's ok”"],
  [/\bnot to be dramatic but\b/, 0.4, "“not to be dramatic but”"],
  [/\bsorry\b/, 0.8, "sorry"],
  [/\bmy bad\b/, 0.6, "my bad"],
  [/\boops\b/, 0.5, "oops"],
  [/\bi guess\b/, 0.5, "i guess"],
  [/\bkind of\b|\bsort of\b/, 0.3, "kind of / sort of"],
  [/\bmaybe\b/, 0.4, "maybe"],
  [/\bidk\b/, 0.4, "idk"],
  [/^just\b/, 0.3, "hedging “just” opener"],
];

const TOP_EMOJI = /[\u{1F451}\u{1F485}\u{1F525}\u{1F624}\u{1F5FF}\u{1F4AA}\u{1FAE1}]/gu; // 👑💅🔥😤🗿💪🫡
const BOTTOM_EMOJI = /[\u{1F979}\u{1F62D}\u{1F64F}\u{1F97A}\u{1F616}\u{1F629}]/gu; // 🥹😭🙏🥺😖😩

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

// Scores one post's text. Returns { score, hits } where score is clamped to
// [-4, 4] and hits lists which signals fired (for the "exhibit" callouts).
export function scorePostText(text) {
  const t = (text || "").trim();
  if (!t) return { score: 0, hits: [] };
  const lower = t.toLowerCase();
  let score = 0;
  const hits = [];

  const add = (w, label) => {
    score += w;
    if (label) hits.push({ label, weight: w });
  };

  for (const [re, w, label] of TOP_SIGNALS) if (re.test(lower)) add(w, label);
  for (const [re, w, label] of BOTTOM_SIGNALS) if (re.test(lower)) add(-w, label);

  const exclaim = (t.match(/!/g) || []).length;
  if (exclaim) add(Math.min(exclaim, 3) * 0.3, "exclamation points");

  const questions = (t.match(/\?/g) || []).length;
  if (questions) add(-Math.min(questions, 3) * 0.3, "question marks");

  if (/(?:\.\.\.|…)\s*$/.test(t)) add(-0.5, "trailing ellipsis");

  const words = t.split(/\s+/).filter(Boolean);
  const shouty = words.filter((w) => w.length >= 3 && w === w.toUpperCase() && /[A-Z]/.test(w)).length;
  if (shouty) add(Math.min(shouty, 3) * 0.4, "ALL CAPS");

  const emojiTop = (t.match(TOP_EMOJI) || []).length;
  if (emojiTop) add(Math.min(emojiTop, 3) * 0.4, "top-coded emoji");
  const emojiBottom = (t.match(BOTTOM_EMOJI) || []).length;
  if (emojiBottom) add(-Math.min(emojiBottom, 3) * 0.4, "bottom-coded emoji");

  return { score: clamp(score, -4, 4), hits };
}

// verdict copy, most extreme first — first range containing `score` wins.
export const VERDICTS = [
  { min: 70, label: "certified top", blurb: "no notes, no hedging, pure declarative energy." },
  { min: 40, label: "top-coded", blurb: "mostly statements. rarely a question mark in sight." },
  { min: 15, label: "leaning top", blurb: "switch energy, but you take the lead when it counts." },
  { min: -15, label: "full switch", blurb: "reads either way depending on the thread. could go anywhere." },
  { min: -40, label: "leaning bottom", blurb: "switch energy, softer edges — more hedges than commands." },
  { min: -70, label: "bottom-coded", blurb: "a lot of “sorry,” “maybe,” and “i guess.”" },
  { min: -Infinity, label: "certified bottom", blurb: "and it's giving “oh damn, i didn't realize it was that obvious.”" },
];

export function verdictFor(score) {
  return VERDICTS.find((v) => score >= v.min);
}

// Averages per-post scores into a single -100..100 timeline score.
export function scoreTimeline(posts) {
  const scored = posts.map((p) => ({ post: p, ...scorePostText(p.text) }));
  const avg = scored.length ? scored.reduce((a, s) => a + s.score, 0) / scored.length : 0;
  const timeline = clamp(Math.round(avg * 25), -100, 100);
  const sorted = [...scored].sort((a, b) => b.score - a.score);
  return {
    timeline,
    verdict: verdictFor(timeline),
    scored,
    mostTop: sorted[0] && sorted[0].score > 0 ? sorted[0] : null,
    mostBottom: sorted[sorted.length - 1] && sorted[sorted.length - 1].score < 0 ? sorted[sorted.length - 1] : null,
    postCount: scored.length,
  };
}
