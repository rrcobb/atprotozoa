// standings.js — turns the network-wide net.bisks.kinesin.walk index into a
// leaderboard: each player's single best (longest) run. Pure function, no
// I/O — feed it GlobalIndex#snapshot().entries. Same shape as
// sites/shelfguessr's standings.js, just "best distance" instead of a
// correct/total tally.

export function computeStandings(walkEntries) {
  const best = new Map(); // did -> { distance, steps, walkedAt }

  for (const w of walkEntries) {
    if (!w || typeof w.distance !== "number" || !w.walkerDid) continue;
    const prev = best.get(w.walkerDid);
    if (!prev || w.distance > prev.distance) best.set(w.walkerDid, w);
  }

  const standings = Array.from(best, ([did, w]) => ({
    did,
    distance: w.distance,
    steps: w.steps,
    walkedAt: w.walkedAt,
  }));

  standings.sort((a, b) => b.distance - a.distance);
  return standings;
}
