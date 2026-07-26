// P vs NP: does every problem whose solution can be *checked* quickly
// (in polynomial time) also admit an algorithm that *finds* a solution
// quickly? That's the real, still-open question. One of seven Clay
// Mathematics Institute Millennium Prize Problems, $1,000,000 on the table
// since 2000. Nothing below resolves it. It's a mad-libs proof generator
// paired with an instant referee, some of whom cite the three real known
// barriers to a proof, and some of whom just point out an ordinary crank
// flaw. Both kinds of rejection are grounded in real complexity theory —
// the generated "proofs" are not.

export const CLAIMS = ["P = NP", "P ≠ NP"];

const TECHNIQUES = [
  "a reduction that is technically polynomial, if you don't look too hard at the exponent",
  "diagonalization against every circuit, twice, out of an abundance of caution",
  "a SAT solver that finished suspiciously fast on the hard instances",
  "the PCP theorem, misquoted from memory",
  "nondeterminism, simulated with a for-loop and a clear conscience",
  "a circuit lower bound we are fairly sure is not natural in the Razborov–Rudich sense",
  "an oracle that happens to agree with us",
  "hand-waving over the tape-alternation step",
  "assuming P = NP as a lemma, then citing the lemma",
  "a change of complexity class nobody asked for",
  "downloading more nondeterminism",
  "an appeal to how fast Minisat felt this morning",
  "algebrization, invoked somewhat rudely",
  "a large language model, which agreed enthusiastically",
  "running the Cook–Levin theorem in reverse",
  "a witness that verifies itself, which should have been the first red flag",
  "the polynomial hierarchy, collapsed by hand",
  "a padding argument padded rather more than usual",
  "counting arguments, applied to a set nobody counted",
  "a Karp reduction borrowed from a problem that isn't quite this one",
];

const CAVEATS = [
  "for all instances except the ones that matter",
  "modulo a gap the margin is too small to contain",
  "assuming the reader doesn't check the base case",
  "up to a polynomial factor we've chosen not to name",
  "on Tuesdays, and every day congruent to Tuesday mod 7",
  "in a universe adjacent to this one",
  "with probability 1, which is basically certainty",
  "for a definition of 'efficient' we're still finalizing",
  "conditional on a conjecture we just made up",
  "in the limit, which we are taking generously",
  "except on a set of instances of measure zero, which is where the hard ones live",
  "assuming the Exponential Time Hypothesis is false, which we have not mentioned until now",
];

// Real barriers first (cited roughly accurately), crank flaws second
// (satirical, but modeled on the actual, common failure modes referees for
// this problem report — see Lance Fortnow's and Scott Aaronson's writing on
// why P vs NP proof attempts fail).
const REVIEWS = [
  "Falls to relativization (Baker–Gill–Solovay, 1975): there exist oracles A and B with P^A = NP^A and P^B ≠ NP^B, so any argument that still works relative to an arbitrary oracle cannot be settling this.",
  "This is a natural proof in the Razborov–Rudich (1994) sense — natural proofs can't separate P from NP unless certain pseudorandom generators fail to exist, which would itself be a separate, enormous breakthrough.",
  "Falls to algebrization (Aaronson–Wigderson, 2008): the argument survives being lifted to low-degree polynomial extensions over a finite field, which a real separation provably cannot do.",
  "The 'polynomial' reduction is exponential wearing a trench coat — the constant the paper calls c is 2^n.",
  "Verified only on instances where the answer was already known in advance.",
  "Confuses 'no known polynomial algorithm' with 'no polynomial algorithm exists.' These are, notably, different claims.",
  "The circuit family constructed is non-uniform, and loses that property exactly on the page where it would be inconvenient.",
  "The nondeterministic guess in step 4 is, on close reading, doing the entire proof by itself.",
  "Reviewer 2: \"this reduces 3-SAT to itself and calls it progress.\"",
  "Anonymous: \"I would believe this if NP were smaller.\"",
  "The witness-checking step assumes what the witness was supposed to prove.",
  "Reviewer 1 has not responded in four years, presumably still checking whether the oracle is being fair to both sides.",
  "Reviewer 3 accepts, conditional on removing all the complexity theory.",
  "\"SFB\" — someone find the bug — Reviewer 2, again.",
  "The editor forwarded this to the Electronic Colloquium on Computational Complexity, which forwarded it to /dev/null.",
  "One reviewer wants it retracted. The other two want to know which SAT solver was used.",
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
  "A one-page",
  "A self-contained",
];

const CLAIM_ATTEMPTS = [
  "The Clay Institute's online submission form times out at the file upload step. Try again in 2038.",
  "Submission received. Auto-reply: \"per section 3(b), the six-month public scrutiny period has not yet begun. It will not begin.\"",
  "The prize committee has forwarded this to a mailing list that stopped being read in 2012.",
  "Error 402: Payment Required (this is a joke, but so is the submission).",
  "Submitted. A polite email arrives asking for the pseudocode. There is no pseudocode.",
  "The form asks for a DOI. This does not have one, and now neither does the attempt.",
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

function fakeEcccId() {
  const yy = 22 + Math.floor(Math.random() * 4);
  const num = String(1 + Math.floor(Math.random() * 199)).padStart(3, "0");
  return `ECCC TR${yy}-${num}`;
}

const RETRACTION_CHANCE = 0.22;

export function attemptProof(claim) {
  const [t1, t2] = pickTwoDistinct(TECHNIQUES);
  const caveat = pick(CAVEATS);
  const title = `${pick(TITLE_ADJ)} proof that ${claim}`;
  const abstract =
    `By combining ${t1} with ${t2}, we establish that ${claim}, ` +
    `${caveat}. Full details are left to the reader, who has already ` +
    `come this far.`;
  const review = pick(REVIEWS);
  const retracted = Math.random() < RETRACTION_CHANCE;
  return {
    id: fakeEcccId(),
    title,
    abstract,
    review,
    retracted,
    claim,
  };
}

export function claimThePrize() {
  return pick(CLAIM_ATTEMPTS);
}
