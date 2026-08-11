// clash.js — turns two public Bluesky profiles into cryptids and writes up
// the tabloid front page announcing their clash.
//
// Same house pattern as sites/creaturearena/public/lib/arena.js: every stat
// is derived from real public profile fields, plus seeded PRNG rolls so the
// clash isn't 100% predictable from stats alone. No Math.random() — the seed
// is a hash of both DIDs together (sorted, so it doesn't matter which input
// box a handle went in), so the exact same pairing always gets the same
// front page. A rerun between the same two handles always prints the same
// story. Unlike creaturearena/spellclash (turn-by-turn HP arena), there's no
// round-based fight here — one seeded roll settles it, tabloid-verdict style,
// because a newspaper reports the outcome, it doesn't referee the fight.

const TE = new TextEncoder();

function hash32(str) {
  let h = 5381;
  for (const b of TE.encode(str)) {
    h = ((h << 5) + h + b) >>> 0;
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length) % arr.length];
}

// Four stats, newspaper-flavored versions of the usual profile-derived set.
function statsFor(profile) {
  const followers = profile.followersCount || 0;
  const follows = profile.followsCount || 0;
  const posts = profile.postsCount || 0;
  const bio = (profile.description || "").length;

  // SIGHT — how often it's reportedly seen, scaled off post count.
  const sight = clamp(Math.log2(posts + 1) * 8, 0, 100);
  // CRED — how many people vouch for it, scaled off raw follower count.
  const cred = clamp(Math.log2(followers + 1) * 9, 0, 100);
  // SKEP — how hard it is to pin down, scaled off follower/follow ratio.
  const skep = clamp((followers / (follows + 1)) * 9, 0, 100);
  // LORE — depth of backstory, scaled off bio flair + profile polish.
  const lore = clamp(bio / 2 + (profile.displayName ? 12 : 0) + (profile.avatar ? 8 : 0), 0, 100);

  return { sight, cred, skep, lore };
}

function dominantStat(stats) {
  return Object.entries(stats).sort((a, b) => b[1] - a[1])[0][0];
}

const SPECIES_BY_STAT = {
  sight: ["Mothman", "Thunderbird", "Flatwoods Monster"],
  cred: ["Sasquatch", "Nessie", "Champ"],
  skep: ["Skinwalker", "Dogman", "Fresno Nightcrawler"],
  lore: ["Jersey Devil", "Chupacabra", "Wendigo"],
};

const EMOJI = {
  Mothman: "🦋", Thunderbird: "🦅", "Flatwoods Monster": "👽",
  Sasquatch: "🦍", Nessie: "🦕", Champ: "🐊",
  Skinwalker: "🐺", Dogman: "🐕", "Fresno Nightcrawler": "👖",
  "Jersey Devil": "🐐", Chupacabra: "🦎", Wendigo: "🦌",
};

const FIELD_MARKS = {
  Mothman: "red glowing eyes, wingspan reported at ten feet, last seen loitering near a power substation",
  Thunderbird: "cloud-sized wings, a scream witnesses describe as \"personally offensive\"",
  "Flatwoods Monster": "spade-shaped head, a hovering gait, and a foul metallic smell that lingers on clothes",
  Sasquatch: "a seven-foot frame, matted fur, footprints that don't match any known boot size",
  Nessie: "a humped silhouette breaking still water, gone before a second photo can be taken",
  Champ: "a serpentine wake in cold lake water, always just past where the dock ends",
  Skinwalker: "a shape that walks wrong, seen only at the edge of headlights, never twice from the same angle",
  Dogman: "a canine build that stands upright when it thinks nobody's looking",
  "Fresno Nightcrawler": "a pair of trousers, apparently ambulatory, apparently unbothered by the concept of a torso",
  "Jersey Devil": "goat head, bat wings, a hoofed kick that's put three separate fences out of commission",
  Chupacabra: "spines down the back, drained livestock, a hiss like a leaking tire",
  Wendigo: "antlers, a gaunt frame, and an appetite the local ranger station has stopped trying to explain",
};

const MOVES = {
  Mothman: ["flaps overhead trailing a bad omen at", "locks glowing red eyes on", "buzzes the substation lights near"],
  Thunderbird: ["blots out the sky diving on", "screams a rolling thunderclap at", "rakes storm-slick talons across"],
  "Flatwoods Monster": ["hisses a cloud of foul mist at", "hovers menacingly toward", "levels a spade-shaped glare at"],
  Sasquatch: ["hurls a felled log at", "stomps a warning that rattles", "crashes through the treeline at"],
  Nessie: ["surges up in a wall of loch-water at", "drags a wake straight through", "vanishes and reappears behind"],
  Champ: ["breaches from cold water beside", "coils a serpentine loop around", "slaps a fin-wave over"],
  Skinwalker: ["steps sideways into the wrong angle from", "mimics a voice to unsettle", "circles just outside the headlights of"],
  Dogman: ["rises onto two legs snarling at", "lunges upright through brush at", "howls a challenge down the ridge at"],
  "Fresno Nightcrawler": ["scissors two trouser-legs threateningly at", "waddles with unsettling purpose toward", "trips-not-trips into"],
  "Jersey Devil": ["delivers a hoofed kick at", "shrieks from the Pine Barrens canopy at", "swoops low with bat wings over"],
  Chupacabra: ["lunges fang-first at", "hisses through the fence line at", "drains the water trough near"],
  Wendigo: ["stalks in from the treeline toward", "lets the cold precede it into", "bellows through frost-cracked jaws at"],
};

const WHIFF_LINES = [
  (a, b) => `${a} makes a move, but ${b} is already a blurry photo in someone's camera roll`,
  (a, b) => `witnesses swear ${a} had ${b} cornered — the trail cam caught nothing but leaves`,
  (a, b) => `${b} was there, then wasn't; ${a} swings at the space where it stood`,
];

const MARGIN_TIERS = [
  { max: 6, label: "in the closest call this desk has ever had to print" },
  { max: 16, label: "by the thinnest whisker of hide" },
  { max: 35, label: "decisively, no follow-up sighting required" },
  { max: Infinity, label: "in a total, headline-grade rout" },
];

function marginLabel(margin) {
  return MARGIN_TIERS.find((t) => margin <= t.max).label;
}

const QUOTE_TEMPLATES = [
  (w) => `"I saw the whole thing," said a local who asked not to be named. "${w.species} didn't even look tired."`,
  (w) => `"We've logged ${Math.round(w.stats.sight)} separate sightings this season alone," a field researcher told the Gazette.`,
  (w) => `"${w.profile.handle}'s creature has ${Math.round(w.stats.cred)} believers vouching for it. That's not nothing," said our correspondent.`,
  (w) => `"Frankly," said a passerby, "I always had ${w.species} pegged as the one to watch."`,
  (w) => `"You can doubt the ${w.species}," said the desk editor, "but you can't doubt the footprints."`,
];

const OPENERS = [
  (a, b) => `Reports reached this desk late last night of a confrontation between ${a} and ${b} — the kind of story we don't get to run twice.`,
  (a, b) => `It was, by all accounts, an ordinary evening until ${a} crossed paths with ${b}.`,
  (a, b) => `This paper does not print cryptid clashes lightly. But when ${a} met ${b}, the newsroom had no choice.`,
];

const CLOSERS = [
  (w) => `The ${w.species} was last seen retreating into cover, undefeated and, as ever, unphotographed.`,
  (w) => `Local skeptics have already begun drafting their rebuttal letters. The ${w.species} did not respond to requests for comment.`,
  (w) => `This paper stands by its reporting. The ${w.species} could not be reached for a follow-up interview.`,
];

// Builds a cryptid dossier for one profile. Deterministic per-DID,
// independent of who the opponent is.
export function buildCryptid(profile) {
  const rng = mulberry32(hash32(profile.did));
  const stats = statsFor(profile);
  const dominant = dominantStat(stats);
  const species = pick(rng, SPECIES_BY_STAT[dominant]);
  const power = Math.round(clamp(30 + stats.sight * 0.4 + stats.cred * 0.3, 30, 100));
  return {
    profile,
    stats,
    dominant,
    species,
    emoji: EMOJI[species],
    moves: MOVES[species],
    fieldMarks: FIELD_MARKS[species],
    power,
  };
}

// Runs the full clash: cryptid dossiers for both sides, a short front-page
// writeup, and a winner. Deterministic per pairing (see module doc).
//
// Every seeded draw below is keyed off p1/p2 — the pairing sorted by DID —
// rather than off profileA/profileB (whichever handle landed in input box
// one). That's what makes it genuinely order-independent: sorting first,
// then drawing, means the same two handles always consume the rng in the
// same sequence no matter which box either one was typed into. Keying draws
// off argument position instead (as sibling sites' arena.js do) means
// retyping the same pairing swapped between the two boxes can hand the
// "first" seeded roll to the other person and change the outcome.
export function runClash(profileA, profileB) {
  const [p1, p2] = [profileA, profileB].sort((x, y) => (x.did < y.did ? -1 : x.did > y.did ? 1 : 0));
  const pairSeed = hash32([p1.did, p2.did].join("|"));
  const rng = mulberry32(pairSeed);

  const c1 = buildCryptid(p1);
  const c2 = buildCryptid(p2);

  const chaos1 = rng() * 30;
  const chaos2 = rng() * 30;

  const score1 = c1.power + c1.stats.skep * 0.25 + c1.stats.lore * 0.2 + chaos1;
  const score2 = c2.power + c2.stats.skep * 0.25 + c2.stats.lore * 0.2 + chaos2;

  const p1Wins = score1 >= score2;
  const winnerSide = p1Wins ? c1 : c2;
  const loserSide = p1Wins ? c2 : c1;
  const margin = Math.abs(score1 - score2);

  const name1 = `${c1.emoji} ${c1.species} (@${c1.profile.handle})`;
  const name2 = `${c2.emoji} ${c2.species} (@${c2.profile.handle})`;
  const attacker1First = rng() < 0.5;
  const [firstName, firstMove, firstTarget] = attacker1First ? [name1, c1, name2] : [name2, c2, name1];

  const clashLine =
    rng() < 0.7
      ? `${firstName} ${pick(rng, firstMove.moves)} ${firstTarget}.`
      : WHIFF_LINES[Math.floor(rng() * WHIFF_LINES.length)](firstName, firstTarget);

  const opener = pick(rng, OPENERS)(name1, name2);
  const closer = pick(rng, CLOSERS)(loserSide);
  const quote = pick(rng, QUOTE_TEMPLATES)(winnerSide);
  const verdict = marginLabel(margin);

  // Species names alone can collide (both sides can independently roll the
  // same cryptid from the same stat pool) — lead with the handle so the
  // headline still reads even when it's "Nessie vs. Nessie".
  const headline = `@${winnerSide.profile.handle}'S ${winnerSide.species.toUpperCase()} BESTS @${loserSide.profile.handle}'S ${loserSide.species.toUpperCase()} ${verdict.toUpperCase()}`;

  // Map back to a/b (profileA/profileB, i.e. input-box order) for the caller.
  const a = p1.did === profileA.did ? c1 : c2;
  const b = p1.did === profileB.did ? c1 : c2;
  const scoreA = a === c1 ? score1 : score2;
  const scoreB = b === c1 ? score1 : score2;
  const winner = winnerSide.profile.did === profileA.did ? "a" : "b";

  return {
    a,
    b,
    winner,
    margin,
    verdict,
    headline,
    opener,
    clashLine,
    quote,
    closer,
    scoreA: Math.round(scoreA),
    scoreB: Math.round(scoreB),
  };
}
