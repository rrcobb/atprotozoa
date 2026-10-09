// Levenshtein edit distance (two-row DP, O(len(a)*len(b)) time, O(len(b)) space).
export function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = new Array(b.length + 1);
  let cur = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[b.length];
}

// Compare only the method-specific id ("did:plc:abc" -> "abc"): the "did:plc:"
// prefix is shared by nearly everyone and would just add a constant to every score.
export function didBody(did) {
  return did.replace(/^did:[a-z0-9]+:/i, "");
}

export function didDistance(a, b) {
  return levenshtein(didBody(a), didBody(b));
}

// Intersection of follows and followers, by DID.
export function mutualsOf(follows, followers) {
  const fr = new Set(followers.map((p) => p.did));
  return follows.filter((p) => fr.has(p.did));
}
