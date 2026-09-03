// standings.js — turns the network-wide net.bisks.shelfguessr.guess index
// into a leaderboard. Pure function, no I/O — feed it GlobalIndex#snapshot()
// .entries for the guess collection. Same shape as sites/skymash's elo.js,
// simplified: no rating math, just a correct/total tally per guesser.

const MIN_GUESSES = 1; // show anyone who's actually played a round — no arbitrary bar

export function computeStandings(guessEntries) {
  const tallies = new Map(); // did -> { correct, total }

  for (const g of guessEntries) {
    if (!g || typeof g.correct !== "boolean" || !g.guesserDid) continue;
    const t = tallies.get(g.guesserDid) || { correct: 0, total: 0 };
    t.total += 1;
    if (g.correct) t.correct += 1;
    tallies.set(g.guesserDid, t);
  }

  const standings = Array.from(tallies, ([did, t]) => ({
    did,
    correct: t.correct,
    total: t.total,
    accuracy: t.total ? Math.round((t.correct / t.total) * 1000) / 10 : 0,
  })).filter((s) => s.total >= MIN_GUESSES);

  standings.sort((a, b) => b.correct - a.correct || b.accuracy - a.accuracy);
  return standings;
}
