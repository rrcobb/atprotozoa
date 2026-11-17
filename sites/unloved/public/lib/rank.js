// rank.js — pure scoring for the unloved queue.
//
// Smaller followers rank higher (1 / log10 of their follower count), and every
// post already queued from the same author halves the next one's weight, so the
// list spreads across many followers instead of one prolific poster.

export const isUnloved = (p) =>
  (p.likeCount || 0) === 0 && (p.repostCount || 0) === 0 && (p.quoteCount || 0) === 0;

export const baseScore = (followersCount) => 1 / Math.log10(10 + Math.max(0, followersCount || 0));

// items: [{ authorDid, followers, indexedAt(ms) }]. Returns the same items
// ordered best-first, each with `.score`. Within one author, newer posts come first.
export function rank(items) {
  const byAuthor = new Map();
  for (const it of items) {
    if (!byAuthor.has(it.authorDid)) byAuthor.set(it.authorDid, []);
    byAuthor.get(it.authorDid).push(it);
  }
  for (const list of byAuthor.values()) {
    list.sort((a, b) => b.indexedAt - a.indexedAt);
    list.forEach((it, i) => { it.score = baseScore(it.followers) * Math.pow(0.5, i); });
  }
  return [...items].sort((a, b) => b.score - a.score);
}
