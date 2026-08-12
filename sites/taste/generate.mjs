// Computes Taste Scores for every atprotozoa requester and writes
// sites/taste/public/data.json.
//
// Reads sites/*/site.json (the same manifests that drive the apex gallery —
// see audit/build-gallery.mjs — and scp.bisks.net's directory). For every
// distinct `by` handle across the catalog:
//   - ownBuilds:   sites credited directly to that handle
//   - borrowedBy:  OTHER builders' sites whose blurb mentions that handle —
//                  i.e. someone else picked up their idea, callout, or
//                  earlier bit and ran with it. This is the literal, checkable
//                  version of "other people use my creations."
// tasteScore weights borrowedBy higher than ownBuilds on purpose: the boast
// this site is answering is about other people using your stuff, not about
// how much stuff you personally asked for.
//
// Usage: node generate.mjs   (run from sites/taste/)
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";

const ROOT = "../../";
const OUT = "./public/data.json";

const OWN_WEIGHT = 1;
const BORROWED_WEIGHT = 3;

const names = readdirSync(ROOT + "sites").filter((n) =>
  existsSync(`${ROOT}sites/${n}/site.json`)
);

const all = names
  .map((n) => {
    try {
      return { ...JSON.parse(readFileSync(`${ROOT}sites/${n}/site.json`, "utf8")), _dir: n };
    } catch {
      return null;
    }
  })
  .filter(Boolean)
  .filter((s) => !s.hidden);

function slim(s) {
  return {
    name: s.name || s._dir,
    title: s.title || s.name || s._dir,
    url: s.url || `https://${s.name || s._dir}.bisks.net/`,
    type: s.type || null,
    by: s.by || null,
    builtAt: s.builtAt || null,
  };
}

// Universe of known handles = distinct non-empty `by` values.
const handles = [...new Set(all.map((s) => s.by).filter((b) => b && String(b).trim()))].sort(
  (a, b) => a.localeCompare(b)
);

// Plain substring match over-fires: "bisks.net" is a suffix of every
// "buildthis.bisks.net" self-reference, so almost every blurb would "mention"
// it. Require the match not be glued to more domain/word characters on
// either side (an @-mention, a bare handle, or a possessive like
// "cee.wtf's" all still match; "buildthis.bisks.net" no longer does).
function isDomainChar(c) {
  return c !== undefined && /[a-z0-9.-]/i.test(c);
}
function mentions(blurb, handle) {
  const b = blurb.toLowerCase();
  const h = handle.toLowerCase();
  let idx = 0;
  while (true) {
    const i = b.indexOf(h, idx);
    if (i === -1) return false;
    if (!isDomainChar(b[i - 1]) && !isDomainChar(b[i + h.length])) return true;
    idx = i + h.length;
  }
}

const board = handles.map((handle) => {
  const ownBuilds = all.filter((s) => s.by === handle).map(slim);

  const borrowedBy = all
    .filter((s) => s.by !== handle && s.blurb && mentions(s.blurb, handle))
    .map(slim);

  const tasteScore = ownBuilds.length * OWN_WEIGHT + borrowedBy.length * BORROWED_WEIGHT;

  return { handle, tasteScore, ownBuilds, borrowedBy };
});

board.sort((a, b) => {
  if (b.tasteScore !== a.tasteScore) return b.tasteScore - a.tasteScore;
  if (b.borrowedBy.length !== a.borrowedBy.length) return b.borrowedBy.length - a.borrowedBy.length;
  if (b.ownBuilds.length !== a.ownBuilds.length) return b.ownBuilds.length - a.ownBuilds.length;
  return a.handle.localeCompare(b.handle);
});

const data = {
  generatedFromSites: all.length,
  ownWeight: OWN_WEIGHT,
  borrowedWeight: BORROWED_WEIGHT,
  board,
};

writeFileSync(OUT, JSON.stringify(data));

console.log(`wrote ${board.length} handles from ${all.length} sites`);
console.log(board.slice(0, 5).map((b) => `${b.handle}: ${b.tasteScore} (own ${b.ownBuilds.length}, borrowed ${b.borrowedBy.length})`));
