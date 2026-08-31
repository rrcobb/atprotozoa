// elo.js — turns the network-wide net.bisks.skymash.vote index into a
// leaderboard. Every vote record is already deduped to one per (rater, pair)
// by its rkey (see the lexicon), so this just replays them in chronological
// order with a standard Elo update. Pure function, no I/O — feed it
// GlobalIndex#snapshot().entries for the vote collection.

const START_RATING = 1500;
const K = 32;

export function computeStandings(voteEntries) {
  const ratings = new Map(); // did -> rating
  const records = new Map(); // did -> { wins, losses }

  const sorted = voteEntries
    .filter((v) => v && v.a && v.b && v.winner && (v.winner === v.a || v.winner === v.b))
    .slice()
    .sort((x, y) => x.votedAt - y.votedAt);

  for (const v of sorted) {
    const loser = v.winner === v.a ? v.b : v.a;
    const rw = ratings.get(v.winner) ?? START_RATING;
    const rl = ratings.get(loser) ?? START_RATING;
    const expectedWin = 1 / (1 + Math.pow(10, (rl - rw) / 400));
    ratings.set(v.winner, rw + K * (1 - expectedWin));
    ratings.set(loser, rl + K * (0 - (1 - expectedWin)));

    const wRec = records.get(v.winner) || { wins: 0, losses: 0 };
    wRec.wins += 1;
    records.set(v.winner, wRec);
    const lRec = records.get(loser) || { wins: 0, losses: 0 };
    lRec.losses += 1;
    records.set(loser, lRec);
  }

  const dids = new Set([...ratings.keys(), ...records.keys()]);
  const standings = Array.from(dids, (did) => {
    const rec = records.get(did) || { wins: 0, losses: 0 };
    const total = rec.wins + rec.losses;
    return {
      did,
      rating: Math.round(ratings.get(did) ?? START_RATING),
      wins: rec.wins,
      losses: rec.losses,
      total,
      winPct: total ? Math.round((rec.wins / total) * 1000) / 10 : null,
    };
  });
  standings.sort((a, b) => b.rating - a.rating);
  return standings;
}
