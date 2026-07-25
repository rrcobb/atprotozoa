// The problems are real (simplified for a webpage; check erdosproblems.com
// for the primary source and current status — these do get resolved out from
// under lists like this one). The proofs generated below are not real.

export const PROBLEMS = [
  {
    name: "Erdős–Straus conjecture",
    field: "number theory",
    statement:
      "For every integer n ≥ 2, does 4/n = 1/x + 1/y + 1/z have a solution in positive integers x, y, z?",
  },
  {
    name: "Erdős conjecture on arithmetic progressions",
    field: "combinatorics",
    statement:
      "If a set of positive integers has divergent sum of reciprocals, must it contain arbitrarily long arithmetic progressions? Erdős considered this one of his favorites and backed it with one of his largest personal bounties.",
  },
  {
    name: "Erdős–Ulam problem",
    field: "geometry",
    statement:
      "Is there a dense subset of the plane in which every pair of points is a rational distance apart?",
  },
  {
    name: "Erdős–Szemerédi sum–product conjecture",
    field: "combinatorics",
    statement:
      "For a finite set of integers A, does max(|A+A|, |A·A|) grow like |A|^(2−ε) for every ε > 0?",
  },
  {
    name: "Happy Ending problem, general case",
    field: "combinatorial geometry",
    statement:
      "Erdős and Szekeres proved enough points in general position always contain a convex polygon of any given size — but the exact minimum count needed, for large polygons, is still unknown.",
  },
  {
    name: "Erdős–Hajnal conjecture",
    field: "graph theory",
    statement:
      "In any graph class that forbids some fixed induced subgraph, must every graph in it contain a clique or independent set of polynomial size, rather than just logarithmic?",
  },
  {
    name: "Erdős's minimum overlap problem",
    field: "combinatorics",
    statement:
      "Split {1, …, 2n} into two equal halves, then shift one by k. How small can the guaranteed overlap be made, over every choice of split and shift?",
  },
  {
    name: "Erdős–Gallai conjecture on cycle covers",
    field: "graph theory",
    statement:
      "Can the edges of every connected graph on n vertices always be covered by at most ⌈(n−1)/2⌉ cycles and edges?",
  },
];

const TECHNIQUES = [
  "the probabilistic method",
  "the pigeonhole principle, applied twice out of spite",
  "a sufficiently large constant, left unnamed",
  "induction on the reader's patience",
  "analytic continuation of vibes",
  "a computer search that ran during a commercial break",
  "asking the conjecture nicely",
  "downloading more RAM",
  "a change of variables nobody asked for",
  "epsilon of room, all of it used",
  "a lemma we are choosing not to prove",
  "several cups of coffee and one (1) nap",
  "a large language model, which agreed enthusiastically",
  "the Axiom of Choice, invoked somewhat rudely",
  "a diagram that definitely exists, just not on this page",
  "renaming the hard case 'degenerate' and moving on",
  "an appeal to Erdős's own good taste",
  "the fact that it's true for n = 1, 2, and 3",
  "a Fourier transform that was mostly for the aesthetic",
  "compactness, which fixes everything eventually",
];

const CAVEATS = [
  "for all n except the ones that matter",
  "modulo a gap the margin is too small to contain",
  "assuming the reader doesn't check too closely",
  "up to a constant we have chosen not to name",
  "for a slightly different, friendlier problem",
  "on Tuesdays, and every day congruent to Tuesday",
  "in a universe adjacent to this one",
  "with probability 1, which is basically certainty",
  "for a definition of 'solution' we are still finalizing",
  "conditional on a conjecture we just made up",
  "in the limit, which we are taking generously",
  "except on a set of measure zero, which is where you live",
];

const REVIEWS = [
  "Reviewer 1 has not responded in four years, presumably still checking the pigeonhole step.",
  "Reviewer 2: \"this is wrong, but beautifully typeset.\"",
  "Reviewer 3 accepts, conditional on removing all the mathematics.",
  "Anonymous: \"I would believe this if it were about a smaller number.\"",
  "Erdős (in absentia): \"My mind is open. It is also, notably, elsewhere.\"",
  "Reviewer 2, again: \"SFB\" (someone find the bug).",
  "The editor has forwarded this to arXiv, which forwarded it to /dev/null.",
  "One reviewer wants it retracted. The other two want to know where the party is.",
  "Reviewer 1: \"the epsilon on page 3 is doing an enormous amount of work.\"",
  "A grad student tried to reproduce this and got a different, also-wrong answer.",
  "Reviewer 3: \"I skipped to the QED. It's there. That's something.\"",
  "No comments received. The paper was, in fairness, only up for six minutes.",
];

const TITLE_ADJ = [
  "A complete",
  "An elementary",
  "A surprisingly short",
  "A somewhat rushed",
  "A definitive",
  "A quiet",
  "An overdue",
  "A slightly haunted",
];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickTwoDistinct(arr) {
  const a = pick(arr);
  let b = pick(arr);
  while (b === a && arr.length > 1) b = pick(arr);
  return [a, b];
}

function fakeArxivId() {
  const yy = 22 + Math.floor(Math.random() * 4); // 22..25-ish, doesn't matter
  const mm = String(1 + Math.floor(Math.random() * 12)).padStart(2, "0");
  const num = String(1000 + Math.floor(Math.random() * 8999));
  return `arXiv:${yy}${mm}.${num}`;
}

const RETRACTION_CHANCE = 0.22;

export function attemptBreakthrough(problem) {
  const [t1, t2] = pickTwoDistinct(TECHNIQUES);
  const caveat = pick(CAVEATS);
  const title = `${pick(TITLE_ADJ)} resolution of the ${problem.name}`;
  const abstract =
    `By combining ${t1} with ${t2}, we resolve the ${problem.name}, ` +
    `${caveat}. Full details are left to the reader, who has already ` +
    `come this far.`;
  const review = pick(REVIEWS);
  const retracted = Math.random() < RETRACTION_CHANCE;
  return {
    id: fakeArxivId(),
    title,
    abstract,
    review,
    retracted,
    field: problem.field,
  };
}
