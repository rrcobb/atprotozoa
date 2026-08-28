// paw.js — the monkey's paw wish granter and its "DO A BREAKTHROUGH"
// escalation, ported from sites/dobreakthrough/public/lib/breakthrough.js.
//
// W.W. Jacobs wrote "The Monkey's Paw" in 1902: three wishes, granted
// exactly as worded and never as intended. This is that joke, mad-libbed —
// no model calls, no randomness. Every grant is picked by hashing
// `${wishId}:${level}` (FNV-1a), so a given wish at a given press-count
// always curls the same way: reproducible, shareable, no server state.
//
// `level` is 1-based: how many times this wish's paw has been curled
// (the first press is the initial grant, every press after is a breakthrough).

function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function pick(seed, arr) {
  return arr[seed % arr.length];
}

// One full lap of the curl: the fist closing knuckle by knuckle, then
// tightening, then reopening for the next wish nobody asked to make. `toll`
// is a base "cost" figure that scales up on every subsequent lap — mashing
// the button forever keeps making it worse, same as dobreakthrough's amount.
export const STAGES = [
  { emoji: "☝️", label: "FIRST KNUCKLE CURLS", fingers: 1, toll: 0 },
  { emoji: "✌️", label: "SECOND KNUCKLE CURLS", fingers: 2, toll: 13 },
  { emoji: "🤟", label: "THIRD KNUCKLE CURLS", fingers: 3, toll: 140 },
  { emoji: "🤙", label: "FOURTH KNUCKLE CURLS", fingers: 4, toll: 1300 },
  { emoji: "✊", label: "THE FIST CLOSES", fingers: 5, toll: 13000 },
  { emoji: "✊", label: "THE FIST TIGHTENS", fingers: 5, toll: 91000 },
  { emoji: "🫴", label: "IT OPENS AGAIN, EMPTY", fingers: 0, toll: 91000 },
  { emoji: "☠️", label: "THE THIRD WISH IS ALREADY SPENT", fingers: 5, toll: 260000 },
];

const MECHANISMS = [
  "granted at market rate: someone else's, transferred to you without a word said about it",
  "the exact wording is honored to the letter; the spirit is not consulted",
  "it arrives correct in every detail except the one that mattered to you",
  "for the standard price — a person you love, unspecified until later",
  "granted in full, itemized, and every line on the receipt is a regret",
  "delivered by the paw's usual courier, three knocks after midnight",
  "true, but only for exactly as long as you don't ask how",
  "technically accurate and cruelly literal, as always",
  "granted whole, minus the one part that made it worth wanting",
  "it works exactly once, and it already spent its once on someone else's wish",
  "the fine print is in your own handwriting, somehow, though you never wrote it",
  "paid in advance, out of an account you didn't know you had",
  "arrives slightly used, with someone else's fingerprints still on it",
  "swapped at the last second for the thing you were actually afraid of",
  "the paw does not negotiate, and neither, now, do you",
  "granted to the letter of the wish and not one syllable more",
  "yours now, and also, quietly, no longer anyone else's",
];

const ASIDES = [
  "(there are two wishes left, allegedly)",
  "(do not ask it twice)",
  "(the fur was still warm)",
  "(somewhere, a door opens)",
  "(W.W. Jacobs tried to warn everyone in 1902)",
  "(you should really stop pressing this)",
  "(it's just a mummified paw from a fakir, or so the story goes)",
  "(the second wish exists only to undo the first)",
  "(read the whole short story sometime — it's four pages and it's worse)",
  "(a knock, in the distance, getting closer)",
  "(the shopkeeper who sold it warned you too)",
  "(it was cheap for a reason)",
];

const TEMPLATES = [
  (wish, mech, aside) => `You wished: "${wish}". Granted — ${mech}. ${aside}`,
  (wish, mech, aside) => `The paw curls. "${wish}" is yours now, ${mech}. ${aside}`,
  (wish, mech, aside) => `"${wish}" — done. The cost: ${mech}. ${aside}`,
  (wish, mech, aside) => `It heard "${wish}" and gave you exactly that: ${mech}. ${aside}`,
  (wish, mech, aside) => `Wish logged, wish honored — "${wish}", ${mech}. ${aside}`,
  (wish, mech, aside) => `The breakthrough: ${mech}, wrapped around your wish for "${wish}". ${aside}`,
  (wish, mech, aside) => `Correct as worded: "${wish}", ${mech}. ${aside}`,
];

export function fmtToll(n) {
  if (n >= 1000000000) return (n / 1000000000).toFixed(1).replace(/\.0$/, "") + "B";
  if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1000) return (n / 1000).toFixed(0) + "K";
  return String(n);
}

// `level` is 1-based. `wishId` should be stable per-wish (index or hash of
// the wish text) so the same wish at the same press count always curls the
// same way.
export function curl(wishId, wishText, level) {
  const stage = STAGES[(level - 1) % STAGES.length];
  const lap = Math.floor((level - 1) / STAGES.length);
  const multiplier = 1 + lap * 4;
  const toll = stage.toll * multiplier;

  const seed = fnv1a(`${wishId}:${level}`);
  const mech = pick(seed, MECHANISMS);
  const aside = pick(seed >>> 3, ASIDES);
  const template = pick(seed >>> 7, TEMPLATES);

  const grant = template(String(wishText || "").trim(), mech, aside);
  const stageLabel = `${stage.emoji} ${stage.label}`;

  return { level, stage: stageLabel, fingers: stage.fingers, grant, lap, toll };
}
