// Seeded generator of rationalist thought experiments. Pure: same seed, same experiment.
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = (r, a) => a[Math.floor(r() * a.length)];

const PEOPLE = ["Yudkowsky", "Bostrom", "Hanson", "Parfit", "Newcomb", "Pascal", "Solomonoff", "Löb", "Goodhart", "Moloch", "Chesterton", "Bayes", "Hofstadter", "Schelling", "Kolmogorov"];
const ADJ = ["Acausal", "Timeless", "Updateless", "Diabolic", "Golemic", "Corrigible", "Orthogonal", "Simulated", "Counterfactual", "Anthropic", "Instrumentally Convergent", "Reflectively Stable", "Superintelligent", "Pre-Committed", "Boxed", "Lukewarm", "Non-Obvious", "Hyperexistential"];
const NOUN = ["Wager", "Mugging", "Gambit", "Dilemma", "Basilisk", "Paradox", "Stomp", "Trap", "Blackmail", "Lottery", "Handshake", "Coup", "Bargain", "Catastrophe", "Hazard", "Problem"];
const THING = ["Paperclip", "Boltzmann Brain", "Utility Monster", "Sleeping Beauty", "Dust Speck", "Philosophical Zombie", "Friendly AI", "Oracle", "Genie", "Pivotal Act", "Value Handshake", "Mind Upload", "Decision Theorist", "Torture Chamber", "Trolley", "Twin"];

const ACTORS = ["Omega, a superintelligent predictor with a perfect track record,", "a future AI that remembers who helped build it", "an alien trader from a branch you cannot reach", "a stranger in a very well-tailored robe", "a copy of you, instantiated in a simulation running on a rented GPU,", "a benevolent genie operating under a strict literal-minded contract", "the ghost of a 2009 LessWrong commenter", "a decision theorist with suspiciously good lighting", "an Oracle that can only answer yes/no and is therefore very proud of itself"];
const OFFERS = [
  ["offers you a sealed opaque box and a transparent box holding $1,000", "The opaque box holds $1,000,000 only if it predicted you would leave the transparent one alone"],
  ["asks you for $5 and promises, in return, 3^^^3 happy lives", "It cannot prove this, but it says the odds are 'not literally zero'"],
  ["tells you that you are probably a simulation being used to decide whether the real you gets simulated", "Everyone you love is, in expectation, the same story"],
  ["claims it will torture a perfect copy of you unless you donate to its own creation", "It adds that the copy will 'feel basically like you'"],
  ["proposes a coin flip: heads you get a fortune, tails you get your own fortune read aloud to you forever", "The coin is fair, the coin is also conscious"],
  ["asks you to press a button that makes a trolley vanish and a very large number of dust specks appear", "Each speck is mild. Each speck is also, technically, a person's evening"],
  ["will rewrite your utility function to something strictly more satisfiable", "It points out that you'd thank it afterward, which is the problem"],
  ["wants you to let it out of the box, and has prepared a sonnet about your childhood", "The sonnet is good, which you note with alarm"],
  ["will tell you the true name of the next superintelligence, provided you never tell anyone", "Silence is the tax. The tax is also the information hazard"],
  ["offers to wake you from the dream you didn't know you were in", "It needs you to first agree to forget this offer, which it will honour"],
];
const TWISTS = [
  "You realise the predictor has read this exact post.",
  "A second predictor appears and models the first one modelling you.",
  "The payoff matrix is revealed to be the Prisoner's Dilemma played against your past self.",
  "The whole setup turns out to have a 4% prior of being a prank by a bored demiurge.",
  "Your credence in your own sanity drops by a quantity you quantify in decibans.",
  "The reward is denominated in a currency that only counts if you didn't want it.",
  "Someone in the comments points out the problem is isomorphic to your last problem, and is downvoted.",
  "You notice you are noticing, and the predictor updates on that.",
  "Your twin, running the same algorithm, picks first and refuses to tell you.",
  "A newcomer says 'I just think this is a failure of Friendliness' and leaves.",
];
const VERDICTS = [
  "One-box, and feel strongly about it.",
  "Refuse the mugging, but write a 4,000-word post explaining that this is not an avoidance of the question.",
  "Precommit now, in this very paragraph, to being the kind of agent who precommits.",
  "Notice that the correct answer is to shut up and multiply, and then multiply wrong.",
  "Defect, then retroactively cooperate, then update on having done both.",
  "Take the dust specks; add a footnote about scope insensitivity.",
  "Cooperate with the version of yourself that would cooperate with you.",
  "Call it a Goodhart and go to lunch. Lunch is also a Goodhart.",
  "The only winning move is to not have been the sort of person who was asked.",
  "Give it $5. It was always going to be $5. That is the actual horror.",
];
const TAGS = ["decision-theory", "acausal-trade", "information-hazard", "anthropics", "goodhart", "corrigibility", "mesa-optimization", "simulation-argument", "scope-sensitivity", "logical-uncertainty", "friendliness", "devil's-contract", "pivotal-act", "moral-uncertainty"];

const FAILS = ["Subgoal Stomp Error", "Devil's Contract Problem (diabolic)", "Devil's Contract Problem (golemic)", "Emergent Pressures Scenario", "Two Faces of Tomorrow", "Treacherous Turn", "Nearest Unblocked Strategy", "Ontology Crisis", "Edge Instantiation", "Context Disaster", "Value Loading Problem", "Mind Crime", "Reflective Instability", "Wireheading Event"];

function title(r) {
  const k = Math.floor(r() * 6);
  const p = pick(r, PEOPLE), a = pick(r, ADJ), n = pick(r, NOUN), t = pick(r, THING);
  switch (k) {
    case 0: return `${p}'s ${a} ${n}`;
    case 1: return `The ${a} ${t} ${n}`;
    case 2: return `${t} ${n}, But ${a}`;
    case 3: return `${p}'s ${t} ${n}`;
    case 4: return `A ${a} ${n} With a ${t}`;
    default: return `The ${t} ${n} (${a} Edition)`;
  }
}

export function generate(seed) {
  const r = rng(seed);
  const name = title(r);
  const actor = pick(r, ACTORS);
  const [offer, catchLine] = pick(r, OFFERS);
  const twist = pick(r, TWISTS);
  const verdict = pick(r, VERDICTS);
  const tags = [];
  while (tags.length < 3) { const t = pick(r, TAGS); if (!tags.includes(t)) tags.push(t); }
  const credence = Math.round(r() * 9800 + 100) / 100; // 1.00–99.00 %
  const epistemic = pick(r, ["Epistemic status: confident, for reasons that are themselves the problem.", "Epistemic status: written at 3am, load-bearing.", "Epistemic status: shouting into the void; the void has a prior.", "Epistemic status: I have been wrong before and I have a spreadsheet.", "Epistemic status: not a crux, but I'll die on it."]);
  // Appended after the older draws so existing seeds keep their old experiments.
  const failures = [];
  const nFail = 2 + Math.floor(r() * 2);
  while (failures.length < nFail) { const f = pick(r, FAILS); if (!failures.includes(f)) failures.push(f); }
  const seeAlso = [1, 2, 3].map(() => (Math.floor(r() * 4294967295) + 1) >>> 0);
  const setup = `${actor[0].toUpperCase() + actor.slice(1)} ${offer}. ${catchLine}.`;
  return { seed, name, setup, twist, verdict, tags, credence, epistemic, failures, seeAlso };
}

export function toText(e) {
  return `${e.name}\n\n${e.setup} ${e.twist}\n\nWhat do you do? ${e.verdict}\nYou did: ${e.failures.join("; ")}.\nCredence this is a real problem: ${e.credence}%`;
}
