// challenges.js — the mandatory "villain leetcode" interview round. Three
// classic technical-interview problems, reskinned. Candidates write a
// `function solve(...)` in the browser and it's run, in the browser, against
// each problem's test cases via `new Function`. This never leaves the
// visitor's own tab — same trust boundary as a JSFiddle, not a server-side
// eval of untrusted input. An infinite loop only hangs the visitor's own
// tab, same risk as any client-side code playground; there's no sandbox
// worth adding for a toy.

export const CHALLENGES = [
  {
    id: "two-face",
    title: "Two-Face Sum",
    prompt:
      "Every villain keeps a ledger of grudges (an array of integers) and a target betrayal total. " +
      "Write function solve(grudges, target) that returns the two indices [i, j] (i < j) whose values sum to target. Exactly one answer exists.",
    starter: "function solve(grudges, target) {\n  // your scheme here\n}\n",
    tests: [
      { args: [[2, 7, 11, 15], 9], expect: [0, 1] },
      { args: [[3, 2, 4], 6], expect: [1, 2] },
      { args: [[-3, 4, 3, 90], 0], expect: [0, 2] },
    ],
  },
  {
    id: "redemption-arc",
    title: "Reverse the Redemption Arc",
    prompt:
      "A hero's arc (a string) needs to run backwards — no growth, no lessons learned. " +
      "Write function solve(arc) that returns the string reversed.",
    starter: "function solve(arc) {\n  // undo their character development\n}\n",
    tests: [
      { args: ["hero"], expect: "oreh" },
      { args: ["redemption"], expect: "noitpmeder" },
      { args: [""], expect: "" },
    ],
  },
  {
    id: "spot-the-mole",
    title: "Spot the Mole",
    prompt:
      "One member of the henchman roster (an array of integers) is a double agent — the only value that appears twice. " +
      "Write function solve(roster) that returns that repeated value, scanning left to right, or null if the whole roster is loyal.",
    starter: "function solve(roster) {\n  // find the traitor\n}\n",
    tests: [
      { args: [[1, 2, 3, 2, 4]], expect: 2 },
      { args: [[5, 6, 7]], expect: null },
      { args: [[9, 9]], expect: 9 },
    ],
  },
];

function deepEqual(a, b) {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  if (Number.isNaN(a) && Number.isNaN(b)) return true;
  return false;
}

// Runs `userCode` (must define `function solve(...)`) against a challenge's
// test cases. Returns { results: [{args, expect, actual, pass, error}], allPass }.
export function runChallenge(challenge, userCode) {
  let solve;
  try {
    solve = new Function(`${userCode}\nreturn typeof solve === "function" ? solve : null;`)();
  } catch (err) {
    return {
      results: challenge.tests.map((t) => ({ args: t.args, expect: t.expect, actual: undefined, pass: false, error: "syntax error" })),
      allPass: false,
      compileError: err && err.message ? err.message : "syntax error",
    };
  }
  if (typeof solve !== "function") {
    return {
      results: challenge.tests.map((t) => ({ args: t.args, expect: t.expect, actual: undefined, pass: false, error: "no function solve(...) found" })),
      allPass: false,
      compileError: "no function solve(...) found",
    };
  }

  const results = challenge.tests.map((t) => {
    try {
      const actual = solve(...t.args);
      return { args: t.args, expect: t.expect, actual, pass: deepEqual(actual, t.expect), error: null };
    } catch (err) {
      return { args: t.args, expect: t.expect, actual: undefined, pass: false, error: err && err.message ? err.message : "runtime error" };
    }
  });
  return { results, allPass: results.every((r) => r.pass) };
}
