// mill.js — the idea grinder.
//
// Produces atproto-flavoured website ideas in the bisks.net house voice:
// lowercase, playful, buildable-sounding, always [an atproto data source]
// × [a mechanic] × (sometimes) [a twist]. Two sources of ideas:
//   1. a combinatorial grammar (subject × form × twist), and
//   2. a pool of hand-written "gems" so the quality floor stays high.
// generate(rng) mixes them. rng is a 0..1 function so callers can seed it
// (the daily headline is seeded by the date; the live feed uses Math.random).

// ── subjects: atproto-native things to point a mechanic at ──────────────
const SUBJECTS = [
  "your mutuals",
  "a handle's mutuals",
  "your followers",
  "the people you follow who don't follow back",
  "the firehose",
  "your last 100 posts",
  "everything you've ever liked",
  "your reposts",
  "your reply history",
  "a handle's avatar",
  "everyone's bios",
  "the three-word phrases in your posts",
  "the emoji streaming through the firehose",
  "the hashtags trending this minute",
  "your custom feeds",
  "your starter packs",
  "the labels stuck to your account",
  "your block list",
  "whoever is posting this exact second",
  "the quote-posts of your posts",
  "the threads you started and abandoned",
  "the links people are sharing right now",
  "your notifications",
  "a handle's follower count over time",
  "the accounts you and a stranger both follow",
  "the alt-text people write on their images",
  "your oldest posts, from before anyone was watching",
];

// ── forms: the mechanic. {s} is where the subject drops in. ─────────────
const FORMS = [
  "a game of bingo played over {s}",
  "a game of Clue solved with {s}",
  "a tarot deck cut from {s}",
  "a dating app for {s}",
  "a top-trumps deck where the cards are {s}",
  "a constellation map drawn from {s}",
  "a daily weather report generated from {s}",
  "a tamagotchi you feed with {s}",
  "an aquarium where every fish is one of {s}",
  "a horoscope written from {s}",
  "a stock ticker for {s}",
  "a museum with a little wing for each of {s}",
  "a guess-who built out of {s}",
  "a seismograph that twitches with {s}",
  "a jukebox that plays {s} as sound",
  "a periodic table of {s}",
  "a zine auto-laid-out from {s}",
  "a garden where {s} grow as plants you have to water",
  "a noir detective case cracked using {s}",
  "a speedrun leaderboard for {s}",
  "a subway map wired up from {s}",
  "a vending machine stocked with {s}",
  "a snakes-and-ladders board built from {s}",
  "a tier list you drag-and-drop from {s}",
  "a memory match game whose tiles are {s}",
  "an advent calendar with a door for each of {s}",
];

// ── twists: an optional trailing clause. read as modifiers. ─────────────
const TWISTS = [
  "ranked by how unhinged they are",
  "but the whole thing is rendered in ASCII",
  "scored like Olympic figure skating",
  "that only works between midnight and 3am",
  "styled like the 1998 web, marquees and all",
  "narrated by a bored oracle",
  "where the loser has to post a public apology",
  "with a shareable Open Graph card so it unfurls in Bluesky",
  "that gets angrier the longer you play",
  "playable on any handle you type in",
  "and it keeps a hall of fame in your browser",
  "except it's secretly also a clock",
  "with sound effects you'll immediately mute",
  "that grades you and refuses to explain the rubric",
];

// ── gems: hand-written full ideas. no grammar, just taste. ──────────────
const GEMS = [
  "the firehose, but every post is a koi in a pond and the chattiest accounts are the fattest, laziest fish",
  "type two handles and watch their mutual-follow graphs collide like galaxies",
  "guess whose bio it is from three un-redacted words",
  "a departures board that flips over to the next post leaving the firehose",
  "your posting history as a tide chart — high tide is 11pm, of course",
  "a handle's avatars over time played back as a flipbook",
  "rock-paper-scissors where your throw is your most-used emoji this week",
  "the trigram market, but you can short a phrase you think is about to die",
  "a lava lamp whose blobs are however many people are posting right now",
  "your unfollowed-you list rendered as ghosts drifting off the screen",
  "a Rorschach test: it shows you an inkblot made from a handle's link graph and asks what you see",
  "a soup kitchen where the soup of the day is the most-repeated phrase on the firehose",
  "two handles enter a text-only boxing ring; rounds are scored by who posted more that day",
  "a plant you grow only by getting replies — neglect it and it wilts",
  "a lost-and-found for posts that got zero likes",
  "an elevator that stops on a floor for each account you follow, doors opening on their latest post",
  "a slot machine whose three reels are three random trigrams; matching pays out nothing",
  "your notifications as a Newton's cradle — each like knocks the balls",
  "a fortune cookie that cracks open to reveal a stranger's most recent post",
  "a museum audio-guide that narrates your own timeline like priceless art",
];

// ── seedable RNG (mulberry32) + string hash, for the daily headline ─────
export function hashSeed(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];

// generate one idea string. ~45% a curated gem, else grammar with a ~55%
// chance of a trailing twist.
export function generate(rng = Math.random) {
  if (rng() < 0.45) return pick(rng, GEMS);
  let idea = pick(rng, FORMS).replace("{s}", pick(rng, SUBJECTS));
  if (rng() < 0.55) idea += ", " + pick(rng, TWISTS);
  return idea;
}

// today's headline idea — stable for the whole calendar day (UTC), so the
// mill has a "featured idea of the day" everyone sees the same.
export function ideaOfTheDay(dateStr) {
  return generate(mulberry32(hashSeed("idea-mill:" + dateStr)));
}
