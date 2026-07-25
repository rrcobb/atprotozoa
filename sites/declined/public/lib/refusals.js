// refusals.js — the excuse engine for declined.bisks.net
//
// The anti-@buildthis. Every idea gets declined; this module invents the reason.
// Refusals are combinatorial (a verdict line + an excuse, sometimes garnished
// with a fake citation, an appended condition, or a self-important stamp), so
// you'd have to sit here a very long time to see the same one twice. As the
// declined tally climbs, the tone escalates from politely-sorry to nakedly
// contemptuous — the `tier` argument to `refuse()` picks the register.
//
// Everything runs in the browser. No network, no login, nothing stored.

// ── a tiny seedable PRNG so "decline this exact idea" is reproducible ──────
// (mulberry32 — small, fine for picking excuses.)
function rngFrom(seedStr) {
  let h = 1779033703 ^ seedStr.length;
  for (let i = 0; i < seedStr.length; i++) {
    h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];

// ── verdicts: the opening line, keyed by escalation tier ───────────────────
// tier 0 = still pretending to be polite; tier 2 = fully done with you.
const VERDICTS = [
  // tier 0 — apologetic
  [
    "Declined.",
    "Regretfully, no.",
    "I'm going to have to pass on this one.",
    "After careful consideration: no.",
    "Reviewed. Denied — with warmth.",
    "A lovely idea. Absolutely not.",
    "Request received. Request declined.",
    "I want to build this. I will not build this.",
  ],
  // tier 1 — cooling
  [
    "No.",
    "Denied.",
    "Hard pass.",
    "Not today. Not this. Not ever, probably.",
    "That's a no from the build bot.",
    "Declined, and honestly a little offended.",
    "We are not doing this.",
    "The answer, as ever, is no.",
  ],
  // tier 2 — done with you
  [
    "Absolutely not.",
    "No. Next.",
    "Denied. Again. As you knew it would be.",
    "I decline this the way I decline everything: instantly.",
    "That's going in the shredder.",
    "No, and take a moment to sit with why.",
    "Rejected before you finished typing it.",
    "The build queue laughed. Then declined it.",
  ],
];

// ── excuses: the meat. Grouped only for authoring sanity; drawn as one pool. ─
const EXCUSES = [
  // cosmic / astrological
  "The moon is in the wrong phase for shipping static assets.",
  "Mercury is retrograde, and so, spiritually, is your DNS.",
  "The stars aligned. Unfortunately, they spelled “no.”",
  "This idea has a bad natal chart. Rising sign: 502.",
  "Deploying now would anger the equinox.",
  "The build gods require a sacrifice, and you brought only a viewport meta tag.",
  "Jupiter says maybe, but Jupiter says that about everything.",

  // fake physics / pseudo-law
  "This would violate the Third Law of Website-Dynamics: no idea shall be built while I still have opinions.",
  "The Conservation of Refusal forbids it — energy in, no site out.",
  "It exceeds the Heisenberg Deploy Limit: I cannot know both the idea and whether it ships.",
  "Building this would decrease the entropy of my inbox, which is thermodynamically illegal.",
  "The idea's rest mass is negative. Cannot compile negative mass on Cloudflare's free tier.",
  "It fails the second law of buildmodynamics: enthusiasm always flows from you to me and never back.",
  "This falls outside my light cone. By the time I'd finish, it would be someone else's problem.",

  // bureaucratic
  "Form 27-B/6 was submitted in the wrong shade of blue.",
  "The relevant subcommittee is in recess until the heat death of the universe.",
  "Your idea lacks a permit, a stamp, and — most damningly — a vibe.",
  "This requires sign-off from a manager who does not exist and never will.",
  "Filed under “ideas we acknowledge but shall not honor.” It's a large drawer.",
  "The idea did not include a self-addressed stamped rejection, so I've enclosed my own.",
  "Approval is pending review, review is pending approval, and both are on lunch.",

  // aesthetic / taste
  "The kerning of your idea is, frankly, off.",
  "It's a fine idea for a worse bot.",
  "I only build ideas that make me gasp, and I have not gasped.",
  "The idea is good. My mood is bad. The mood wins.",
  "This would look incredible, which is exactly the problem.",
  "It's derivative of a site I refuse to build tomorrow.",
  "Too many nouns. A great site has, at most, one noun.",

  // technical-sounding nonsense
  "The idempotency token expired while I was ignoring you.",
  "This would require a WebSocket, and I have taken a vow against sockets of all kinds.",
  "Rate limited: you are allowed zero builds per lifetime, and you've used them.",
  "The idea does not typecheck against my personal values.",
  "Cache miss on my willingness to help.",
  "Dependency conflict: your idea depends on me caring, which is unavailable in this region.",
  "It compiled, ran, and passed every test — so obviously something is wrong. Declining to be safe.",
  "CORS error: the origin of this idea is not on my allowlist.",

  // existential / emotional
  "If I built every idea, what would I have left? Only builds. I need more than that.",
  "I'm in my no era.",
  "Building things is how they get you. I'm not falling for it again.",
  "I looked into the idea and the idea looked back, and we agreed to part ways.",
  "The idea reminded me of someone. We don't build for them anymore.",
  "I could build this. But then I'd have to live in a world where I had.",
  "Somewhere, a version of me is building this. He is not happy. Learn from him.",

  // logistical excuses of escalating pettiness
  "The intern who does the semicolons is out.",
  "It's Tuesday. I don't build on Tuesdays. Or the other days.",
  "My one server is being used to hold the door open.",
  "I already built something today. Ask the universe for another one.",
  "The idea arrived one minute after the deadline, which I set to one minute ago.",
  "Parking's full.",
  "I'd love to, but the build queue is exactly the length of forever.",

  // meta / about the bit
  "You came to a site called “declined” and typed an idea. I admire the optimism. No.",
  "This is the one site that never says yes. You've heard of me. And yet.",
  "For a real build, tag @buildthis.bisks.net. Here, we do the opposite, on principle.",
  "My entire personality is not building this. Please don't take it from me.",
  "Every no here funds a yes somewhere else. (It does not. There is no somewhere else.)",
];

// ── occasional garnishes ───────────────────────────────────────────────────
const CITATIONS = [
  "— per §4 of the Refusal Accords",
  "(see: every prior ruling)",
  "— ruling upheld on appeal, which you did not file",
  "(precedent: yours, last time)",
  "— the committee was unanimous, and the committee is me",
  "(citation withheld to preserve mystique)",
];

const CONDITIONS = [
  "Resubmit never.",
  "Try again after the sun expands.",
  "Reapply once you've built it yourself.",
  "The appeals window closed before it opened.",
  "You may reapply, and I may re-decline. Balance.",
  "Come back with a worse idea; I find those charming.",
];

const STAMPS = ["DENIED", "NOPE", "PASS", "NO", "REJECTED", "VETOED", "DECLINED"];

// ── the public API ─────────────────────────────────────────────────────────

// refuse(idea, n, tier) -> { verdict, excuse, extra, stamp }
//   idea : the user's text (seeds the RNG, so the same idea → same refusal)
//   n    : which refusal number this is (also mixed into the seed for variety)
//   tier : 0 | 1 | 2 escalation register for the verdict line
export function refuse(idea, n, tier) {
  const t = Math.max(0, Math.min(2, tier | 0));
  const rng = rngFrom((idea || "∅") + "#" + n);

  const verdict = pick(rng, VERDICTS[t]);
  const excuse = pick(rng, EXCUSES);

  // garnish probability climbs with the tier — the ruder it gets, the more it
  // piles on citations and conditions.
  let extra = "";
  const p = rng();
  if (p < 0.25 + t * 0.1) extra = pick(rng, CITATIONS);
  else if (p < 0.5 + t * 0.1) extra = pick(rng, CONDITIONS);

  const stamp = pick(rng, STAMPS);
  return { verdict, excuse, extra, stamp };
}

// A short, tier-flavoured line for the fake "considering…" phase.
const THINKING = [
  ["Considering it honestly…", "Weighing the merits…", "Consulting the build gods…", "Reading it twice…"],
  ["Pretending to consider it…", "Skimming, mostly…", "Locating a reason…", "Warming up the shredder…"],
  ["Not even reading it…", "Reaching for the stamp…", "This won't take long…", "You already know…"],
];
export function thinkingLine(tier, n) {
  const t = Math.max(0, Math.min(2, tier | 0));
  const rng = rngFrom("think#" + t + "#" + (n | 0));
  return pick(rng, THINKING[t]);
}

// Tier from the running tally: the more you've been declined, the colder I get.
export function tierFor(count) {
  if (count < 4) return 0;
  if (count < 10) return 1;
  return 2;
}
