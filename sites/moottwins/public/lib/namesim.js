// namesim.js — flag mutuals whose *display names* are easy to mix up, even
// when their pfps aren't close at all. Independent of vision.js/mnemonic.js:
// two people can look nothing alike and still be the ones you keep calling
// by each other's name because "Alex Kim" and "Alex Kimm" are one letter
// apart, or because "Sam" is sitting right inside "Samantha."
//
// Rule-based, same spirit as the rest of this site: plain Levenshtein edit
// distance scaled by length, plus a substring check for the nickname case
// that a pure edit-distance ratio scores too low to catch.

function normalize(name) {
  return (name || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip accents, e.g. "José" ~ "jose"
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] : 1 + Math.min(prev[j - 1], prev[j], cur[j - 1]);
    }
    prev = cur;
  }
  return prev[n];
}

// Ratio at/above which two normalized names read as genuinely confusable —
// short of exact matches, this is roughly "one or two characters different"
// on a typical 5-12 character first name or handle-derived display name
// (e.g. "sam lee" vs "sam lea"). Below it, names just happen to share a few
// letters and calling that out would be noise, not a mnemonic.
const NAME_SIMILARITY_THRESHOLD = 0.72;
// Shorter than this, edit-distance ratio is too noisy to mean anything —
// e.g. "jo" vs "jr" is 1 edit on length 2, a 0.5 ratio that looks alarming
// but isn't a real mixup risk.
const MIN_NAME_LENGTH = 3;

function compare(nameA, nameB) {
  const dist = levenshtein(nameA, nameB);
  const maxLen = Math.max(nameA.length, nameB.length);
  const ratio = 1 - dist / maxLen;
  // A short name sitting inside a longer one (nickname vs. full name) has a
  // large raw edit distance but is exactly the kind of mixup that happens —
  // treat it as at least as confusable as the threshold requires.
  const contains = nameA !== nameB && nameA.length >= MIN_NAME_LENGTH && nameB.length >= MIN_NAME_LENGTH &&
    (nameA.includes(nameB) || nameB.includes(nameA));
  if (contains) return { ratio: Math.max(ratio, NAME_SIMILARITY_THRESHOLD), reason: "contains" };
  return { ratio, reason: "edit" };
}

// people: [{ displayName, handle, ... }]. Returns [{ i, j, ratio, reason }],
// greedily matched (each person appears in at most one pair, same as
// findTwins in the main script) so one generic first name doesn't eat the
// whole list, sorted by how close the match is.
export function findNameTwins(people) {
  const norm = people.map((p) => normalize(p.displayName || p.handle));
  const candidates = [];
  for (let i = 0; i < people.length; i++) {
    if (norm[i].length < MIN_NAME_LENGTH) continue;
    for (let j = i + 1; j < people.length; j++) {
      if (norm[j].length < MIN_NAME_LENGTH) continue;
      const cmp = compare(norm[i], norm[j]);
      if (cmp.ratio >= NAME_SIMILARITY_THRESHOLD) candidates.push({ i, j, ratio: cmp.ratio, reason: cmp.reason });
    }
  }
  candidates.sort((a, b) => b.ratio - a.ratio);
  const used = new Set();
  const twins = [];
  for (const c of candidates) {
    if (used.has(c.i) || used.has(c.j)) continue;
    used.add(c.i);
    used.add(c.j);
    twins.push(c);
  }
  return twins;
}

export { normalize, levenshtein };
