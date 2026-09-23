// vote-key.js — pure rkey derivation for net.bisks.elopt.vote, split out of
// records.js so it has no dependency on oauth.js (which touches
// `location.origin` at import time and so can't be imported under plain
// node — see tests/elo.test.mjs). No browser globals here at all.

// Turns a DID into a record-key-safe fragment (rkeys allow
// [a-zA-Z0-9._~:-], but ":" trips some clients up in practice, so we swap it
// for "-" too).
function didFrag(did) {
  return String(did).replace(/^did:/, "").replace(/[^a-zA-Z0-9._~-]/g, "-");
}

function atUriRkey(uri) {
  const m = /^at:\/\/[^/]+\/[^/]+\/([^/]+)$/.exec(String(uri || ""));
  return m ? m[1] : "root";
}

// One vote per (voter, unordered pair of subjects, thread) — sorting the
// pair before building the key means A-vs-B and B-vs-A land on the same
// record, so a re-vote (even after picking the two people in the other
// order) overwrites instead of creating a duplicate.
export function voteRkey(subjectA, subjectB, threadUri) {
  const pair = [didFrag(subjectA), didFrag(subjectB)].sort();
  return `${pair[0]}_${pair[1]}_${atUriRkey(threadUri)}`.slice(0, 500);
}
