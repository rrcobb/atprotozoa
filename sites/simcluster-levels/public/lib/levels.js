// levels.js — turns a cluster.js banner (self + SimCluster moots, real
// followersCount/followsCount/postsCount) into an Amazon-leveling-system
// parody: rank the pool by real followersCount and cut it into deciles, S1
// (bottom) to S10 (top). No invented lore — the number IS the real
// percentile, same "dress real stats up" move as simcluster-gacha's rarity
// tiers and simcluster-samesame's mutual rate.

export const TITLES = [
  null, // index 0 unused, levels are 1-indexed
  "Intern (unpaid, unverified)",
  "New Grad, Still Excited",
  "Individual Contributor",
  "Senior, Technically",
  "Staff, On Paper",
  "Senior Staff (Bar Raiser Candidate)",
  "Principal, By Vibes",
  "Distinguished Lurker",
  "Bar Raiser Emeritus",
  "VP of the Timeline",
];

// Color per level — reuses the gacha rarity palette at the ends (gray →
// blue → purple → gold) so the family shares a visual language.
export function colorFor(level) {
  if (level <= 2) return "#9aa0ad";
  if (level <= 4) return "#4ea1ff";
  if (level <= 6) return "#7dd6c0";
  if (level <= 8) return "#c084fc";
  return "#ffd24e";
}

// Rank `people` (array of {followersCount, ...}) by real followersCount,
// descending, and assign each an S-level 1-10 by decile. Ties share the
// bucket their sort position lands in — fine, this isn't a real HR system.
function assignLevels(people) {
  const sorted = [...people].sort((a, b) => b.followersCount - a.followersCount);
  const n = sorted.length;
  return sorted.map((p, i) => {
    const pct = n <= 1 ? 0 : i / n;
    const level = Math.min(10, Math.max(1, 10 - Math.floor(pct * 10)));
    return { ...p, level };
  });
}

// Build the full leveling report for a cluster.js result: `self` gets a
// level from where it ranks against its own pool, every pool member gets
// one too, so you can see who in your cluster outranks you.
export function buildLevels(cluster) {
  const everyone = assignLevels([cluster.self, ...cluster.pool]);
  const self = everyone.find((p) => p.did === cluster.self.did) || everyone[0];
  const roster = everyone
    .filter((p) => p.did !== self.did)
    .sort((a, b) => b.level - a.level || b.followersCount - a.followersCount);

  const histogram = new Array(11).fill(0); // index 1-10
  for (const p of everyone) histogram[p.level]++;

  // Real numbers dressed up in leveling-review vocabulary — nothing here is
  // invented, it's mutuals/follows/posts relabeled.
  const oneWay = Math.max(0, cluster.counts.follows - cluster.counts.mutuals);
  const stats = {
    docReviews: cluster.counts.mutuals, // one "doc review" per mutual secured
    coffeePotPanics: oneWay, // accounts you follow that haven't ratified you back
    selfNominations: self.postsCount || 0, // posts, relabeled
  };

  return {
    self,
    roster,
    histogram,
    stats,
    counts: cluster.counts,
    kind: cluster.kind,
  };
}

// The "field notes" mad-lib — a direct riff on the corporate-leveling-hell
// genre post, reworded onto the SimCluster's S-number culture. Deterministic
// off real numbers, not random, so re-rolling the same handle gives the
// same paragraph.
export function fieldNotes(handle, report) {
  const { self, stats, counts } = report;
  const lvl = self.level;
  const title = TITLES[lvl];
  return (
    `As an outside hire at S${lvl} (${title}), I found the SimCluster's leveling system ` +
    `fascinating (like a car crash) and bewildering (like Stockholm syndrome). People ` +
    `introduce themselves with their S-number before their handle. My moots quantify their ` +
    `year to date with ${stats.docReviews} logged doc review${stats.docReviews === 1 ? "" : "s"} ` +
    `(mutuals, if you want the boring name for it), and they go into mild panic if they're seen ` +
    `replying to an S1 by the coffee pot — I counted ${stats.coffeePotPanics} account${stats.coffeePotPanics === 1 ? "" : "s"} ` +
    `@${handle} follows that haven't ratified the follow back. From what I've seen, the entire ` +
    `${counts.pool + 1}-account cluster revolves around S-numbers and pursuing higher ones exclusively ` +
    `through mutual-securing with higher-S accounts. It results in uncountable hours pre-drafting ` +
    `replies for review, even — I wish I were joking — pre-reviews of the pre-review. We spend ` +
    `infinitely more energy talking about posting than actually posting.`
  );
}
