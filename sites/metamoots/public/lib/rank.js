// rank.js — turn the raw given/received counts from crawl.js into a ranked
// list of "meta-mutuals": people neither side follows, where the engagement
// signal runs *both* ways. A one-way superfan (they like everything you
// post, you've never once engaged back) isn't a meta-mutual, just a fan —
// so anyone with a zero on either side is dropped before ranking, not just
// scored low.

const LIKE_W = 1;
const REPOST_W = 2;
const REPLY_W = 3;
const QUOTE_W = 3; // given-only signal, weighted like a reply — both take effort

function givenTotal(c) {
  return c.likesGiven + c.repostsGiven + c.repliesGiven + c.quotesGiven;
}
function receivedTotal(c) {
  return c.likesReceived + c.repostsReceived + c.repliesReceived;
}

function score(c) {
  return (
    c.likesGiven * LIKE_W +
    c.repostsGiven * REPOST_W +
    c.repliesGiven * REPLY_W +
    c.quotesGiven * QUOTE_W +
    c.likesReceived * LIKE_W +
    c.repostsReceived * REPOST_W +
    c.repliesReceived * REPLY_W
  );
}

// Returns { mutual, oneSided } — `mutual` is engagement-both-ways,
// score-sorted descending; `oneSided` is everyone else with nonzero
// engagement on exactly one side, kept as a fallback when `mutual` comes up
// thin (a small post sample can miss the return side of a real
// meta-mutual).
export function rankCandidates(candidateMap) {
  const mutual = [];
  const oneSided = [];
  for (const [did, c] of candidateMap) {
    const g = givenTotal(c);
    const r = receivedTotal(c);
    if (!g && !r) continue;
    const row = { did, ...c, given: g, received: r, score: score(c) };
    if (g > 0 && r > 0) mutual.push(row);
    else oneSided.push(row);
  }
  mutual.sort((a, b) => b.score - a.score);
  oneSided.sort((a, b) => b.score - a.score);
  return { mutual, oneSided };
}
