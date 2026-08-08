// Build-time solver: finds every valid 3x3 "sator square" — a grid where
// grid[i][j] === grid[j][i] (so row i reads identically to column i) — using
// only real 3-letter words plus the bonus acronym set. Run with:
//   node scripts/generate.mjs
// Writes public/data/squares.json and public/data/words.json.

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { WORDS } from "./words.mjs";
import { ACRONYMS } from "./acronyms.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

const acronymWords = Object.keys(ACRONYMS).map((w) => w.toLowerCase());
const dict = Array.from(new Set([...WORDS, ...acronymWords])).filter(
  (w) => w.length === 3,
);
const dictSet = new Set(dict);

// Index words by first letter, and by (first, second) letter pair, so the
// third-row lookup (fixed first two letters) is O(1) instead of a scan.
const byFirst = new Map();
const byFirstTwo = new Map();
for (const w of dict) {
  const f = w[0];
  if (!byFirst.has(f)) byFirst.set(f, []);
  byFirst.get(f).push(w);

  const f2 = w.slice(0, 2);
  if (!byFirstTwo.has(f2)) byFirstTwo.set(f2, []);
  byFirstTwo.get(f2).push(w);
}

const squares = [];
const seen = new Set();

for (const w1 of dict) {
  const [a, b, c] = w1;
  // row1 must start with b (grid[1][0] === grid[0][1] === b)
  const row1Candidates = byFirst.get(b) || [];
  for (const w2 of row1Candidates) {
    const d = w2[1];
    const e = w2[2];
    // row2 must start with c, and its second letter must be e
    // (grid[2][0]===c, grid[2][1]===grid[1][2]===e)
    const key = c + e;
    const row2Candidates = byFirstTwo.get(key) || [];
    for (const w3 of row2Candidates) {
      const rows = [w1, w2, w3];
      const dedupeKey = rows.join(",");
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      const acronymHits = rows
        .map((w) => w.toUpperCase())
        .filter((w) => ACRONYMS[w]);

      squares.push({ rows, acronyms: acronymHits });
    }
  }
}

console.log(`dictionary: ${dict.length} words`);
console.log(`squares found: ${squares.length}`);
const withAcronym = squares.filter((s) => s.acronyms.length > 0);
console.log(`squares containing a bonus acronym: ${withAcronym.length}`);

const outDir = join(__dirname, "..", "public", "data");
writeFileSync(
  join(outDir, "squares.json"),
  JSON.stringify(squares),
);
writeFileSync(
  join(outDir, "words.json"),
  JSON.stringify({ words: dict.sort(), acronyms: ACRONYMS }),
);
console.log("wrote public/data/squares.json and public/data/words.json");
