// Pure scheduling: what sounds fire when, per lure mode. No Web Audio here
// so this is testable under node — app.js just walks the event list and
// fires the matching synth function at each offset, repeating every
// `cycleMs`.
//
// "clicks" is the bit itself: four rapid tongue-clicks, same cadence as
// saying "bsk bsk bsk bsk" out loud. "chirp" and "squeak" are the other two
// real cat lures (a bird tweet, a rodent squeak) and "all" interleaves every
// lure into one longer cycle instead of layering them on top of each other.

const CLICK_GAP_MS = 130;
const CLICKS_PER_BURST = 4;

function clickEvents(startAt = 0) {
  return Array.from({ length: CLICKS_PER_BURST }, (_, i) => ({
    type: "click",
    at: startAt + i * CLICK_GAP_MS,
  }));
}

const MODES = {
  clicks: () => ({
    events: clickEvents(0),
    cycleMs: CLICKS_PER_BURST * CLICK_GAP_MS + 380,
  }),
  chirp: () => ({
    events: [{ type: "chirp", at: 0 }],
    cycleMs: 1400,
  }),
  squeak: () => ({
    events: [{ type: "squeak", at: 0 }],
    cycleMs: 1100,
  }),
  all: () => ({
    events: [...clickEvents(0), { type: "chirp", at: 700 }, { type: "squeak", at: 1400 }],
    cycleMs: 2200,
  }),
};

export function buildCycle(mode) {
  const build = MODES[mode] || MODES.all;
  return build();
}

export const LURE_MODES = Object.keys(MODES);
