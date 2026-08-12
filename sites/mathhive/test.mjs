// Quick correctness check for solver.js, run with `node test.mjs`. Not part
// of the deploy — just a sanity net for the reduction/equation/word-problem
// logic before touching the DOM (no headless browser in this sandbox).
import MathHive from "./public/solver.js";

const cases = [
  // arithmetic
  ["3 + 4 * 2", 11],
  ["(5 - 2)^2 + 1", 10],
  ["10 / 2 / 5 - 1", 0],
  ["-3 + 5", 2],
  // linear equations
  ["2x + 3 = 11", 4],
  ["3x + 2 = x + 10", 4],
  // word problems
  ["Sam has 3 apples and buys 4 more, how many does he have?", 7],
  ["Maria had 10 stickers but gave away 3, how many are left?", 7],
  ["There are 3 groups of 4 students each, how many students total?", 12],
  ["A baker made 20 cookies and divided them among 4 friends, how many did each get?", 5],
  ["Twelve birds were on a wire, 5 flew away, how many are left?", 7],
  ["A farmer has a dozen eggs and finds 5 more, how many eggs now?", 17],
  ["Half of 10 kids left the party, and 2 more arrived, how many changes total?", 7],
  ["There were 5 apples, 2 were eaten, and 6 more were bought, how many now?", 9],
  ["A shelf has 20 books split evenly among 5 boxes, how many per box?", 4],
  ["There is one apple and two oranges, how many pieces of fruit?", 3],
  ["A classroom has 24 desks. 9 students are absent today, how many desks are occupied?", 15],
  ["Tom has double 5 apples and eats 2, how many left?", 8],
  ["There are 4 boxes with 3 pens each, how many pens total?", 12],
];

let failed = 0;
for (const [input, expected] of cases) {
  let got;
  try {
    got = MathHive.solve(input).answer;
  } catch (e) {
    got = `ERROR: ${e.message}`;
  }
  const ok = String(got) === String(expected);
  if (!ok) failed++;
  console.log(`${ok ? "OK  " : "FAIL"} ${JSON.stringify(input)} -> ${got}${ok ? "" : ` (expected ${expected})`}`);
}

// error cases: should throw, not produce an answer
for (const bad of ["no numbers here at all", "only 7 here"]) {
  try {
    MathHive.solve(bad);
    console.log(`FAIL ${JSON.stringify(bad)} -> expected an error, got a result`);
    failed++;
  } catch (e) {
    console.log(`OK   ${JSON.stringify(bad)} -> threw: ${e.message}`);
  }
}

if (failed) {
  console.log(`\n${failed} failing case(s)`);
  process.exit(1);
}
console.log("\nall passing");
