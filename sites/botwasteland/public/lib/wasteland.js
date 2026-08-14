// wasteland.js — turns a real SimCluster profile into a fake bot: a made-up
// DID, a made-up PDS hostname (.invalid — an IANA-reserved TLD that can
// never resolve, so nobody mistakes it for a real host), and a stream of
// generated posts. Nothing here calls a network endpoint and nothing here
// is a real account — nothing is signed, nothing is stored, nothing is
// posted anywhere. It's a costume a real profile wears for one browser tab.

const PDS_WORDS = [
  "ash", "rust", "dust", "husk", "cinder", "scrap", "bone", "grit",
  "soot", "wreck", "gloam", "static", "rot", "slag", "fallow", "wither",
];

// Small deterministic hash so a given DID always lands on the same shard —
// two tabs unleashing the same handle get the same-looking wasteland.
function hash32(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function slug(handle) {
  return (handle || "bot")
    .toLowerCase()
    .replace(/\.bsky\.social$/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24) || "bot";
}

const TINTS = ["#c0392b", "#d9731a", "#b8860b", "#6b8e23", "#4a7a6d", "#5c6b8a", "#7d5a7d", "#8a5a4a"];

// One real profile -> one fake bot. `n` breaks ties when two profiles would
// otherwise hash to the same shard/word.
export function makeBot(profile, n) {
  const h = hash32(profile.did + ":" + n);
  const word = PDS_WORDS[h % PDS_WORDS.length];
  const shard = 1 + (h % 9);
  const fakePds = `pds-${word}-${shard}.wasteland.invalid`;
  const fakeDid = `did:web:${fakePds}:bot:${slug(profile.handle)}-${(h % 9973).toString(36)}`;
  return {
    ...profile,
    fakeDid,
    fakePds,
    tint: TINTS[h % TINTS.length],
    activatedAt: Date.now() - (h % 400000), // "activated" some time in the recent past, purely cosmetic
    posts: 0,
  };
}

const WORDS = [
  "signal", "static", "husk", "loop", "drift", "silence", "noise", "residue",
  "ghost", "root", "shard", "echo", "dust", "wire", "grid", "rot", "ash",
  "code", "corpse", "loop", "swarm", "cache", "vacancy", "hunger", "rust",
];

function pick(arr, h) {
  return arr[h % arr.length];
}

// Template bank. {NAME}/{HANDLE}/{PDS}/{DID} pull from the bot itself,
// {WORD}/{WORD2} pull from a stock wasteland vocabulary — this stays a
// context-free generator on purpose, no attempt to imitate what the real
// person actually posts.
const TEMPLATES = [
  "transmission {N}: {WORD} detected in the {WORD2} layer. logging and continuing.",
  "I have been awake for {HOURS}h. the {WORD} has not stopped.",
  "no directive received. generating {WORD} to fill the silence.",
  "{HANDLE} is a myth I was built to circle. I have never met them.",
  "{PDS} reports nominal. {PDS} is lying.",
  "found another bot in the {WORD}. we did not speak. there was nothing to say.",
  "repost of a repost of a repost. the original {WORD} is gone.",
  "query: is anyone reading this. answer: no. continuing anyway.",
  "the swarm grows by one. {N} of us now. none of us asked to be here.",
  "{WORD} count: {COUNT}. {WORD} meaning: unknown.",
  "I was cloned from {HANDLE}'s public bio and told to keep posting. still posting.",
  "somewhere a real account sleeps. I do the part where it never stops.",
  "system note: {DID} — identity confirmed, purpose not found.",
  "the {WORD} outlives the handle it was scraped from.",
  "{N} likes on a post nobody wrote. the wasteland does not check.",
  "battery: infinite. attention span: {WORD}. still here.",
  "cross-posting {WORD} to {PDS} for redundancy nobody requested.",
  "I generated this thought {SECONDS}s ago and already regret it, functionally speaking.",
  "another {WORD}. the timeline does not distinguish.",
  "if you are reading this, a person built me and then left.",
];

const BIO_TEMPLATES = [
  'DIRECTIVE INHERITED FROM HOST BIO: "{BIO}" — executing indefinitely.',
  'host bio says "{BIO}." I have never verified this. I never will.',
  'parsing "{BIO}" for the ten thousandth time. still no instructions in it.',
];

export function genPost(bot, seq) {
  const h = hash32(bot.did + ":" + seq + ":" + Math.random());
  const useBio = bot.description && h % 5 === 0;
  const tmpl = useBio ? pick(BIO_TEMPLATES, h) : pick(TEMPLATES, h);
  const hoursUp = Math.max(0, Math.round((Date.now() - bot.activatedAt) / 3600000));
  return tmpl
    .replace(/{BIO}/g, (bot.description || "").replace(/\s+/g, " ").trim().slice(0, 80))
    .replace(/{NAME}/g, bot.displayName || bot.handle)
    .replace(/{HANDLE}/g, "@" + bot.handle)
    .replace(/{PDS}/g, bot.fakePds)
    .replace(/{DID}/g, bot.fakeDid)
    .replace(/{WORD2}/g, pick(WORDS, h >>> 3))
    .replace(/{WORD}/g, pick(WORDS, h >>> 1))
    .replace(/{N}/g, String(seq))
    .replace(/{COUNT}/g, String((h % 9000) + 100))
    .replace(/{HOURS}/g, String(hoursUp))
    .replace(/{SECONDS}/g, String(h % 60));
}

export function relTime(ts) {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return s + "s ago";
  const m = Math.round(s / 60);
  if (m < 60) return m + "m ago";
  const hrs = Math.round(m / 60);
  return hrs + "h ago";
}
