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
  { key: "claimed", glyph: "⚔", label: "Claimed", rule: "to be claimed is the highest honor a poster can receive: @norvid-studies.bsky.social quote-posts one of your posts with just the word \"claim\" = full marks" },
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

// counts: { follows, followers, mutuals }; claimed: boolean, or null when the
// claimer's repo couldn't be read (the tenet is then left out, not zeroed)
export function scoreTenets(counts, summary, claimed) {
  return {
    reciprocity: ratio(counts.mutuals, counts.follows),
    standing: ratio(counts.mutuals, counts.followers),
    tribute: summary.n ? summary.tribute / summary.n : null,
    generosity: summary.n ? summary.replies / summary.n : null,
    constancy: summary.spanMonths ? Math.min(1, summary.activeMonths / summary.spanMonths) : null,
    craft: summary.images ? summary.alted / summary.images : null,
    claimed: claimed === null ? null : claimed ? 1 : 0,
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

// ---------------------------------------------------------------------------
// Claims: a claim is a quote-post by the claimer whose whole text is the word
// "claim" (case, surrounding whitespace and punctuation ignored), quoting a
// post that belongs to `did`.

const quotedUri = (rec) => {
  const e = rec && rec.embed;
  if (!e) return null;
  if (e.$type === "app.bsky.embed.record" && e.record) return e.record.uri || null;
  if (e.$type === "app.bsky.embed.recordWithMedia" && e.record && e.record.record) return e.record.record.uri || null;
  return null;
};

export const isClaimText = (text) =>
  typeof text === "string" && text.trim().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "").toLowerCase() === "claim";

// claimerPosts: [{ uri, value }] — every post in the claimer's repo.
// Returns [{ t, createdAt, uri, target }] oldest first.
export function findClaims(claimerPosts, did) {
  const out = [];
  for (const { uri, value } of claimerPosts) {
    if (!isClaimText(value.text)) continue;
    const target = quotedUri(value);
    if (!target || !target.startsWith(`at://${did}/`)) continue;
    const t = Date.parse(value.createdAt);
    if (!Number.isFinite(t)) continue;
    out.push({ t, createdAt: value.createdAt, uri, target });
  }
  return out.sort((a, b) => a.t - b.t);
}

// ---------------------------------------------------------------------------
// Honor over time. The tenets that can be replayed from a post history —
// tribute, generosity, constancy, craft, claimed — are re-scored cumulatively
// at the end of every month since the first post. (Reciprocity and standing
// are about the follow graph as it is today; the graph has no replayable
// history here, so the timeline leaves them out.)
//
// Also returns the "hatch of honor" badges: dated moments on that timeline.

const MONTH_NAMES = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
export const monthLabel = (t) => { const d = new Date(t); return `${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };

const POST_MILESTONES = [100, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000];
// Rank badges wait for this many posts: a month-one score from three posts is
// noise, and a "Paragon" hatch for it would be a joke at the wrong person's expense.
const RANK_BADGE_MIN_POSTS = 25;

// claims: findClaims() output, or null when the claimer's repo couldn't be read
// (the claimed tenet is then left out of the series).
export function buildTimeline(records, claims, now = Date.now()) {
  const posts = [];
  for (const rec of records) {
    const t = Date.parse(rec.createdAt);
    if (Number.isFinite(t) && t <= now) posts.push({ t, rec });
  }
  posts.sort((a, b) => a.t - b.t);
  if (!posts.length) return { points: [], badges: [] };

  const mi = (t) => { const d = new Date(t); return d.getUTCFullYear() * 12 + d.getUTCMonth(); };
  const first = mi(posts[0].t), last = mi(now);
  const badges = [];
  const add = (t, kind, glyph, title, detail, uri) => badges.push({ t, kind, glyph, title, detail, uri: uri || null });

  let n = 0, replies = 0, tribute = 0, images = 0, alted = 0, activeMonths = 0, streak = 0;
  let sawReply = false, sawTribute = false, sawAlt = false, nextMilestone = 0, bestRank = RANKS.length - 1;
  const claimList = claims || [];
  let pi = 0, ci = 0, claimedSoFar = 0;
  const points = [];

  for (let m = first; m <= last; m++) {
    let any = false;
    while (pi < posts.length && mi(posts[pi].t) <= m) {
      const { t, rec } = posts[pi++];
      any = true;
      n++;
      if (n === 1) add(t, "first", "🥚", "First Word", "the first post: where the record begins.", null);
      const isReply = !!rec.reply, trib = hasMention(rec) || isQuote(rec);
      if (isReply) { replies++; if (!sawReply) { sawReply = true; add(t, "reply", "☼", "First Answer", "the first reply to someone else."); } }
      if (trib) { tribute++; if (!sawTribute) { sawTribute = true; add(t, "tribute", "✦", "First Tribute", "the first time a peer got named."); } }
      for (const im of imagesOf(rec)) {
        images++;
        if (im && typeof im.alt === "string" && im.alt.trim()) {
          alted++;
          if (!sawAlt) { sawAlt = true; add(t, "craft", "✎", "First Description", "the first image given alt text."); }
        }
      }
      while (nextMilestone < POST_MILESTONES.length && n >= POST_MILESTONES[nextMilestone]) {
        add(t, "milestone", "🏛", `${POST_MILESTONES[nextMilestone].toLocaleString()} Posts`, `post number ${POST_MILESTONES[nextMilestone].toLocaleString()}.`);
        nextMilestone++;
      }
    }
    if (any) { activeMonths++; streak++; } else streak = 0;
    const monthStart = Date.UTC(Math.floor(m / 12), m % 12, 1);
    if (any && streak > 0 && streak % 12 === 0) {
      add(monthStart, "streak", "⏳", `${streak / 12} Year${streak > 12 ? "s" : ""} Unbroken`, `${streak} months in a row with at least one post.`);
    }
    while (ci < claimList.length && mi(claimList[ci].t) <= m) {
      const c = claimList[ci++];
      claimedSoFar++;
      add(c.t, "claim", "⚔",
        claimedSoFar === 1 ? "Claimed" : "Claimed Again",
        claimedSoFar === 1 ? "@norvid-studies.bsky.social quote-posted this with just the word \"claim\". there is no higher honor." : "claimed once more. the claim stands.",
        c.target);
    }

    const parts = [];
    if (n) { parts.push(tribute / n); parts.push(replies / n); }
    parts.push(activeMonths / (m - first + 1));
    if (images) parts.push(alted / images);
    if (claims) parts.push(claimedSoFar ? 1 : 0);
    const score = parts.reduce((a, b) => a + b, 0) / parts.length;
    points.push({ t: m === last ? now : monthStart, score, n });

    if (n >= RANK_BADGE_MIN_POSTS) {
      const idx = RANKS.findIndex((r) => score >= r.min);
      if (idx >= 0 && idx < bestRank && RANKS[idx].min > 0) {
        bestRank = idx;
        add(monthStart, "rank", "♛", RANKS[idx].name, `the honor score first reached ${Math.round(RANKS[idx].min * 100)}%.`);
      }
    }
  }
  badges.sort((a, b) => a.t - b.t);
  return { points, badges };
}
