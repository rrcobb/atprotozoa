// A three-line blessing generator in the cadence of a stray incantation
// once cast at @buildthis: "Peace and prosperity for all. Make a
// breakthrough. Make no mistakes." Each line has its own word bank; casting
// picks one phrase from each and stitches the fixed cadence back together.

const WISHES = [
  "peace and prosperity",
  "clarity and good timing",
  "steady nerves and clean diffs",
  "luck and a fair wind",
  "rest and a light queue",
  "courage and a quiet inbox",
  "focus and one good idea",
  "patience and a warm cache",
];

const TARGETS = [
  "all",
  "everyone reading this",
  "your next deploy",
  "this whole thread",
  "every moot in the drum",
  "the build bot",
  "whoever needs it today",
  "the timeline",
  "your local main branch",
];

const BREAKTHROUGHS = [
  "a breakthrough",
  "a clean merge",
  "a green build",
  "a working prototype on the first try",
  "the fix you've been circling",
  "a shipped feature",
  "a good idea worth keeping",
  "a bug that finally explains itself",
];

const CARE = [
  "the edge cases",
  "the migration",
  "the deploy",
  "the merge conflict",
  "the rate limits",
  "the schema",
  "the secrets",
  "the cron job",
  "the firehose",
  "today",
];

function pick(bank) {
  return bank[Math.floor(Math.random() * bank.length)];
}

function cap(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// `who` optionally overrides the TARGETS bank (e.g. a handle typed by hand).
export function cast(who) {
  const target = (who && who.trim()) || pick(TARGETS);
  const line1 = `${cap(pick(WISHES))} for ${target}.`;
  const line2 = `Make ${pick(BREAKTHROUGHS)}.`;
  const line3 = `Make no mistakes with ${pick(CARE)}.`;
  return `${line1} ${line2} ${line3}`;
}
