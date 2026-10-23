// honor.js — the SimCluster code of honor, as math. Pure functions (no DOM,
// no fetch) so tests/honor.test.mjs can call them directly.
//
// Every tenet is a fraction 0..1, or null when there's nothing to measure
// (no images posted → no alt-text rate). The overall honor is the plain mean
// of the tenets that have data.

export const CLAIMER = "norvid-studies.bsky.social";

export const TENETS = [
  { key: "reciprocity", glyph: "⇄", label: "Reciprocity", rule: "follow back those who follow you: mutuals ÷ follows" },
  { key: "standing", glyph: "♜", label: "Standing", rule: "be followed by those you follow: mutuals ÷ followers" },
  { key: "tribute", glyph: "✦", label: "Tribute", rule: "name your peers: share of posts that @mention or quote someone" },
  { key: "generosity", glyph: "☼", label: "Generosity", rule: "answer others: share of posts that are replies" },
  { key: "constancy", glyph: "⏳", label: "Constancy", rule: "show up: share of calendar months, first post to now, with at least one post" },
  { key: "craft", glyph: "✎", label: "Craft", rule: "describe your images: share of images carrying alt text" },
  { key: "claimed", glyph: "⚔", label: "Claimed", rule: "to be claimed by @norvid-studies.bsky.social is the highest honor a poster can receive: mutual with them = full marks" },
];

const ratio = (a, b) => (b > 0 ? Math.min(1, a / b) : null);

// A record's images, whether directly embedded or under a recordWithMedia.
function imagesOf(rec) {
  const e = rec && rec.embed;
  if (!e) return [];
  if (Array.isArray(e.images)) return e.images;
  if (e.media && Array.isArray(e.media.images)) return e.media.images;
  return [];
}

function hasMention(rec) {
  for (const f of rec.facets || []) {
    for (const ft of f.features || []) {
      if (ft.$type === "app.bsky.richtext.facet#mention") return true;
    }
  }
  return false;
}

function isQuote(rec) {
  const t = rec.embed && rec.embed.$type;
  return t === "app.bsky.embed.record" || t === "app.bsky.embed.recordWithMedia";
}

// Reduce raw app.bsky.feed.post record values to the counts the tenets need.
export function summarizePosts(records, now = Date.now()) {
  let n = 0, replies = 0, tribute = 0, images = 0, alted = 0;
  const months = new Set();
  let first = Infinity;
  for (const rec of records) {
    n++;
    if (rec.reply) replies++;
    if (hasMention(rec) || isQuote(rec)) tribute++;
    for (const im of imagesOf(rec)) {
      images++;
      if (im && typeof im.alt === "string" && im.alt.trim()) alted++;
    }
    const t = Date.parse(rec.createdAt);
    if (Number.isFinite(t) && t <= now) {
      if (t < first) first = t;
      const d = new Date(t);
      months.add(d.getUTCFullYear() * 12 + d.getUTCMonth());
    }
  }
  let spanMonths = 0;
  if (Number.isFinite(first)) {
    const a = new Date(first), b = new Date(now);
    spanMonths = (b.getUTCFullYear() * 12 + b.getUTCMonth()) - (a.getUTCFullYear() * 12 + a.getUTCMonth()) + 1;
  }
  return { n, replies, tribute, images, alted, activeMonths: months.size, spanMonths };
}

// counts: { follows, followers, mutuals }; claimed: boolean
export function scoreTenets(counts, summary, claimed) {
  return {
    reciprocity: ratio(counts.mutuals, counts.follows),
    standing: ratio(counts.mutuals, counts.followers),
    tribute: summary.n ? summary.tribute / summary.n : null,
    generosity: summary.n ? summary.replies / summary.n : null,
    constancy: summary.spanMonths ? Math.min(1, summary.activeMonths / summary.spanMonths) : null,
    craft: summary.images ? summary.alted / summary.images : null,
    claimed: claimed ? 1 : 0,
  };
}

export function overall(scores) {
  const v = Object.values(scores).filter((x) => x !== null && x !== undefined);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
}

export const RANKS = [
  { min: 0.75, name: "Paragon of the Cluster", line: "bards will be asked to leave the room so they can't get it wrong." },
  { min: 0.55, name: "Knight-Errant", line: "honorable, with room for a good deed or two." },
  { min: 0.35, name: "Squire", line: "the code is mostly followed, and the rest is vibes." },
  { min: 0.18, name: "Free Agent", line: "no one has sworn you in, but no one has thrown you out either." },
  { min: 0, name: "Dishonored Lurker", line: "the code has no entry for you. start with a reply and an alt text." },
];

export function rankFor(score) {
  return RANKS.find((r) => score >= r.min) || RANKS[RANKS.length - 1];
}

// The tenet the handle is strongest / weakest on, among those with data.
export function extremes(scores) {
  const have = TENETS.filter((t) => scores[t.key] !== null && scores[t.key] !== undefined);
  if (!have.length) return { best: null, worst: null };
  const sorted = have.slice().sort((a, b) => scores[b.key] - scores[a.key]);
  return { best: sorted[0], worst: sorted[sorted.length - 1] };
}
