// The idea engine behind antecedent. "build this" has no antecedent until
// something points at a noun — this module IS that pointing: it combines
// word banks into a plausible little atprotozoa-shaped site idea, the same
// shape as the ~330 sites already in this repo (a portmanteau name + a
// one-line pitch that mashes a mechanic, an atproto-flavored subject, and a
// gimmick together).
//
// Deterministic from a seed so an idea is a shareable, reproducible URL
// (?s=<seed>&t=<topic>) — reroll gets a fresh seed, but a generated idea
// itself never silently changes under someone who bookmarked it.

// ---- tiny seeded PRNG (mulberry32) — no crypto needed, just reproducible --
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function newSeed() {
  try {
    return crypto.getRandomValues(new Uint32Array(1))[0];
  } catch {
    return Math.floor(Math.random() * 4294967296);
  }
}

function pick(rng, list) {
  return list[Math.floor(rng() * list.length)];
}

// ---- word banks -----------------------------------------------------------

const NAME_PREFIX = [
  "moot", "skeet", "clout", "grudge", "hex", "grift", "hive", "vibe",
  "block", "quote", "thread", "alt", "hand", "loop", "echo", "static",
  "ratio", "receipt", "handle", "firehose", "shadow", "ghost", "feed",
  "reply", "mutual", "label", "purge", "gossip", "trust", "spite",
];

const NAME_SUFFIX = [
  "graph", "hive", "dex", "meter", "tron", "verse", "court", "bureau",
  "index", "ology", "watch", "works", "engine", "league", "clash",
  "ville", "quest", "forge", "lab", "gambit", "brawl", "cartel",
  "circuit", "archive", "syndicate",
];

const SUBJECTS = [
  "your mutuals", "your block list", "old skeets", "the firehose",
  "reply guys", "quote posts", "your alt account", "your follower count",
  "starter packs", "custom feeds", "your drafts folder", "your PDS",
  "your OAuth scopes", "the timeline", "your notifications", "labelers",
  "your app passwords", "your DID", "handle changes", "your like history",
  "group chats", "your pinned post", "the algorithm", "screenshots of you",
  "your first ever post", "unfollowed accounts", "your longest thread",
];

const FORMATS = [
  "a leaderboard for", "a tarot deck drawn from", "a wheel you spin for",
  "a courtroom drama starring", "a dating app matching", "a stock market for",
  "a haunted house built out of", "a talent show judged by", "a seance for",
  "an auction house selling", "a fantasy draft league for",
  "a roguelike dungeon generated from", "a vending machine stocked with",
  "a support group for", "a demolition derby between",
  "a weather forecast for", "a police sketch artist for",
  "a wrestling entrance for", "a group chat that only argues about",
];

const GIMMICKS = [
  "except every result is cursed", "but it judges you out loud",
  "that only works at 3am", "gamified with a currency nobody asked for",
  "that ages in real time whether you look at it or not",
  "run entirely by bots arguing with each other",
  "where the loser gets read their own like history back to them",
  "that generates a b-movie poster of the outcome",
  "that live-updates off the firehose",
  "where you can bet fake currency on the outcome",
  "that only tells the truth once a day",
  "with a scoreboard absolutely nobody asked for",
  "that ends in a duel", "that unionizes halfway through",
  "narrated like a nature documentary",
  "that keeps a grudge longer than you do",
];

const TAGS = ["toy", "game", "joke", "tool", "art"];

// ---- assembly ---------------------------------------------------------

function nameFor(rng) {
  return pick(rng, NAME_PREFIX) + pick(rng, NAME_SUFFIX);
}

function subjectFor(rng, topic) {
  // ~1 in 3, weave in the user's word (when given) instead of a stock subject.
  if (topic && rng() < (1 / 3)) {
    const t = topic.trim();
    return rng() < 0.5 ? t : "your " + t;
  }
  return pick(rng, SUBJECTS);
}

export function generate(seed, topic) {
  const rng = mulberry32(seed);
  const name = nameFor(rng);
  const format = pick(rng, FORMATS);
  const subject = subjectFor(rng, topic);
  const gimmick = pick(rng, GIMMICKS);
  const tag = pick(rng, TAGS);
  const pitch = `${format} ${subject}, ${gimmick}.`;
  return { seed, topic: topic || "", name, pitch, tag };
}

export function buildPrompt(idea) {
  // What actually gets sent to the bot — the whole point of the exercise.
  return `${idea.name}: ${idea.pitch}`;
}
