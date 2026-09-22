// mood.js — turns post text into a point on a mood ring.
//
// The original ask wanted this "jev based" — Jev (TypeSafe's System One
// model) is one of the providers surveyed in notes/40-new-site-playbook.md,
// and it's the one entry marked blocked: it sends no CORS headers on any
// auth variant, so a browser can't call it at all, and this repo doesn't run
// a server-side proxy that would hold an API key on visitors' behalf (that's
// a Rob decision, not a buildthis one — see the "visitor's own API key"
// section of that note). So this reads tone the same way sites/beefcheck and
// sites/epistemics do: a small hand-written word lexicon plus a few
// punctuation/caps/emoji heuristics, no model call, nothing to CORS-block.
//
// Two axes, same shape as the circumplex model of emotion:
//   valence   -1 (negative) .. +1 (positive)
//   intensity  0 (flat/quiet) .. 1 (loud/keyed-up)
// A small table of named moods anchors both axes to a hue, and every score
// gets a hue by inverse-distance-weighted blending across every anchor (not
// just the nearest one) — the same "weighted match" shape as vulnscope's
// scoreVuln, so nearby readings shade into each other instead of jumping
// between hard-edged buckets.

const POSITIVE = [
  "love", "loved", "loving", "great", "amazing", "good", "thanks", "thank you",
  "appreciate", "haha", "lol", "lmao", "lmaooo", "agree", "based", "fair",
  "valid", "yeah", "yes", "exactly", "beautiful", "awesome", "glad", "happy",
  "proud", "congrats", "congratulations", "nice", "sweet", "yay", "excited",
  "hyped", "stoked", "grateful", "blessed", "win", "winning", "🤝", "❤️",
  "😂", "🙏", "💛", "🥹", "😊", "🎉", "✨", "😍", "🥰", "😄",
];
const NEGATIVE = [
  "hate", "hated", "hating", "worst", "terrible", "awful", "bad", "stupid",
  "wrong", "disagree", "cringe", "garbage", "trash", "pathetic", "ridiculous",
  "shut up", "block", "unfollow", "gross", "ugh", "screw you", "screw this",
  "liar", "lying", "fake", "clown", "grow up", "unbelievable", "disgusting",
  "tired", "exhausted", "sad", "crying", "miss", "lonely", "anxious", "scared",
  "sorry", "worried", "stressed", "angry", "furious", "pissed", "🙄", "💀",
  "🤡", "🚩", "😢", "😭", "😡", "😞", "😔",
];

const EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu;

function clamp(x, lo, hi) {
  return Math.max(lo, Math.min(hi, x));
}

function scoreValence(text) {
  const lower = text.toLowerCase();
  let pos = 0,
    neg = 0;
  for (const w of POSITIVE) if (lower.includes(w)) pos++;
  for (const w of NEGATIVE) if (lower.includes(w)) neg++;
  // Divide by 3, not by the match count: a single matched word (pos=1,
  // neg=0) shouldn't already sit at the extreme, a handful of consistent
  // ones should.
  return clamp((pos - neg) / 3, -1, 1);
}

function scoreIntensity(text) {
  let score = 0;
  const exclaims = (text.match(/!/g) || []).length;
  score += Math.min(exclaims, 4) * 0.12;
  const qmarks = (text.match(/\?/g) || []).length;
  score += Math.min(qmarks, 4) * 0.04;
  const letters = text.replace(/[^a-zA-Z]/g, "");
  if (letters.length >= 4) {
    const upperRatio = (letters.match(/[A-Z]/g) || []).length / letters.length;
    score += upperRatio * 0.5; // ALL CAPS shouting
  }
  const emojiCount = (text.match(EMOJI_RE) || []).length;
  score += Math.min(emojiCount, 5) * 0.08;
  if (/([a-z])\1{2,}/i.test(text)) score += 0.15; // "soooo", "hahaha" elongation
  return clamp(score, 0, 1);
}

// name, human color name (for share text), anchor point, and base hue.
export const MOODS = [
  { name: "serene", swatch: "pale blue", v: 0.55, i: 0.12, hue: 195 },
  { name: "content", swatch: "green", v: 0.35, i: 0.3, hue: 140 },
  { name: "elated", swatch: "hot pink", v: 0.75, i: 0.72, hue: 322 },
  { name: "smitten", swatch: "violet", v: 0.65, i: 0.42, hue: 280 },
  { name: "restless", swatch: "amber", v: 0.0, i: 0.78, hue: 44 },
  { name: "wistful", swatch: "indigo", v: -0.32, i: 0.18, hue: 236 },
  { name: "prickly", swatch: "burnt orange", v: -0.45, i: 0.55, hue: 22 },
  { name: "storming", swatch: "red", v: -0.75, i: 0.85, hue: 356 },
  { name: "numb", swatch: "gray", v: -0.05, i: 0.05, hue: 0, sat: 6 },
];

const BLURBS = {
  serene: "reading calm and mostly good — steady, unbothered energy.",
  content: "reading warm and settled — nothing dramatic, in a good way.",
  elated: "reading bright and loud — genuinely hyped about something.",
  smitten: "reading warm and a little intense — soft-launching a feeling.",
  restless: "reading keyed-up and mixed — a lot of energy, hard to pin down.",
  wistful: "reading a little down and quiet — low-key, not upset, just low.",
  prickly: "reading annoyed and a bit sharp — some friction in there.",
  storming: "reading loud and unhappy — something's clearly got them going.",
  numb: "reading flat — not much emotional signal either way.",
};
export function blurbFor(label) {
  return BLURBS[label] || "";
}

function hueBlend(entries) {
  // Circular mean: average hues as unit vectors, not as raw numbers, or
  // 350deg and 10deg would average to 180deg (the opposite color) instead
  // of 0deg (the color actually between them).
  let x = 0,
    y = 0;
  for (const e of entries) {
    const rad = (e.hue * Math.PI) / 180;
    x += Math.cos(rad) * e.weight;
    y += Math.sin(rad) * e.weight;
  }
  let deg = (Math.atan2(y, x) * 180) / Math.PI;
  if (deg < 0) deg += 360;
  return deg;
}

export function moodFor(valence, intensity) {
  let best = null;
  let bestDist = Infinity;
  const hueEntries = [];
  let satSum = 0,
    weightSum = 0;
  for (const m of MOODS) {
    const dv = valence - m.v,
      di = intensity - m.i;
    const dist = Math.sqrt(dv * dv + di * di);
    if (dist < bestDist) {
      bestDist = dist;
      best = m;
    }
    const w = 1 / (dist * dist + 0.02); // epsilon avoids a divide-by-zero on an exact anchor hit
    hueEntries.push({ hue: m.hue, weight: w });
    satSum += (m.sat ?? 68) * w;
    weightSum += w;
  }
  const hue = hueBlend(hueEntries);
  const sat = clamp(satSum / weightSum, 6, 85);
  const light = 40 + intensity * 12;
  return { label: best.name, swatch: best.swatch, hue, sat: Math.round(sat), light: Math.round(light) };
}

export function hsl(h, s, l) {
  return `hsl(${Math.round(h)} ${Math.round(s)}% ${Math.round(l)}%)`;
}

function mean(nums) {
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

// posts: array of { text, uri, createdAt }, newest first, already bounded to
// the last 10 by the caller (see getLastTenPosts).
export function analyzeMood(posts) {
  if (!posts.length) return null;
  const perPost = posts.map((p) => {
    const text = p.text || "";
    const valence = scoreValence(text);
    const intensity = scoreIntensity(text);
    const m = moodFor(valence, intensity);
    return { ...p, text, valence, intensity, ...m, color: hsl(m.hue, m.sat, m.light) };
  });
  const valence = mean(perPost.map((p) => p.valence));
  const intensity = mean(perPost.map((p) => p.intensity));
  const agg = moodFor(valence, intensity);
  return {
    valence,
    intensity,
    ...agg,
    color: hsl(agg.hue, agg.sat, agg.light),
    blurb: blurbFor(agg.label),
    perPost,
    postCount: perPost.length,
  };
}
