// Pure sentence-generation logic for the baseline test. No DOM references —
// importable from tests (node --test) and from app.js alike.
//
// The whole bit: the film's baseline test escalates by reciting a growing
// poem from the top each round, then breaks into looser, more personal
// questions. Here the "poem" is a recursive chain of simcluster in-jokes —
// `weave()` nests one phrase inside the next via "interlinked within", so
// asking for round N literally *is* asking for N-deep interlinking. Growing
// the round count is what makes the sentence "increasingly intricate and
// interwoven" — that's not scripted per round, it falls out of the
// recursion.

export const NOUNS = ["bisk", "bloosk", "a borges story", "a gwern cat post", "the wall cukes"];
export const PREDICATE = "mogged by 4th grade girls";
export const GREETING = "gm, fellow top chickens";

export function shuffle(list, rng = Math.random) {
  const arr = list.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Recursively nests phrases: weave(["a","b","c"]) ->
// "a, interlinked within b, interlinked within c"
export function weave(list) {
  if (list.length === 0) return "";
  if (list.length === 1) return list[0];
  return `${list[0]}, interlinked within ${weave(list.slice(1))}`;
}

function cap(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// One round per prefix length of the shuffled noun order: round i recites
// the i-deep weave from scratch, mirroring the film's "recite the whole
// thing again, plus one more line" cadence.
export function buildRecitationRounds(order) {
  const rounds = [];
  for (let i = 1; i <= order.length; i++) {
    rounds.push(cap(weave(order.slice(0, i))) + ".");
  }
  return rounds;
}

// The one injected, more personal-sounding question — always drawn from
// the same phrase order so it's still a fresh combination every run.
export function buildInterjection(order) {
  const a = order[0];
  const b = order[order.length - 1];
  return `Do you long to be interlinked with ${a}? Have they let you leave ${b} behind?`;
}

// The climax: the full weave, plus the one predicate phrase and the one
// greeting phrase folded in as the loop closes. This is the shareable
// result text.
export function buildClimax(order) {
  const chain = weave(order);
  return (
    `${cap(chain)}, and dreadfully distinct against the timeline, ${PREDICATE} — ` +
    `${GREETING} — interlinked, interlinked, interlinked.`
  );
}

// Builds one full, randomized test run: recitation rounds (escalating
// depth), one interjected question, and the closing climax line.
export function buildTest(rng = Math.random) {
  const order = shuffle(NOUNS, rng);
  return {
    order,
    recitation: buildRecitationRounds(order),
    interjection: buildInterjection(order),
    climax: buildClimax(order),
  };
}
