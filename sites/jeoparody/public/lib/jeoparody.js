// jeoparody.js — build a one-category Jeopardy board out of a Bluesky
// handle's own posts: five clues, five dollar values, each clue written in
// alliterative verse (three words sharing the topic's first letter), and the
// "answer" is the topic itself — the thing that handle mentions most.
//
// Runs entirely CLIENT-SIDE against the public AppView + PDS, anonymously
// (no auth, no worker, no secrets). identity resolution + repo harvesting
// copied from sites/bardposting/public/lib/sonnet.js and retuned: that site
// ranks words for sonnet-meter fit, this one ranks them for raw "what do you
// keep bringing up" frequency, and boosts hashtags as an explicit topic
// signal a poster chose themselves.

import { fetchRepoRecords } from "./car.js";

const PUB = "https://api.bsky.app/xrpc";
const PLC_DIR = "https://plc.directory";
// Fallback pagination backstop — only used when the CAR download below fails
// (oversized repo, non-CORS PDS, malformed CAR). Pages to exhaustion; this
// cap just guards against a pathological account, sized to match the
// FOLLOWERS_PAGES precedent (notes/40-new-site-playbook.md, "no arbitrary
// caps") rather than an arbitrary "felt safe" number.
const MAX_FALLBACK_PAGES = 400;

async function jget(url) {
  const r = await fetch(url);
  if (!r.ok) {
    const e = new Error(`HTTP ${r.status}`);
    e.status = r.status;
    throw e;
  }
  return r.json();
}

// Resolve a handle / URL / @mention / DID to a DID. Forgiving about paste
// formats (copied from bardposting's resolveActor).
async function resolveActor(actor) {
  const a = (actor || "")
    .trim()
    .replace(/^@/, "")
    .replace(/^at:\/\//, "")
    .replace(/^https?:\/\/(bsky\.app\/profile\/)?/, "")
    .split("/")[0];
  if (!a) throw new Error("empty handle");
  if (a.startsWith("did:")) return a;
  const d = await jget(
    `${PUB}/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(a)}`,
  );
  if (!d.did) throw new Error(`couldn't resolve "${a}"`);
  return d.did;
}

async function resolvePds(did) {
  let doc;
  if (did.startsWith("did:plc:")) doc = await jget(`${PLC_DIR}/${did}`);
  else if (did.startsWith("did:web:"))
    doc = await jget(`https://${did.slice(8).replace(/:/g, "/")}/.well-known/did.json`);
  else throw new Error("unsupported DID method");
  const svc = (doc.service || []).find(
    (s) => s.type === "AtprotoPersonalDataServer" || s.id === "#atproto_pds",
  );
  if (!svc) throw new Error("no PDS in DID doc");
  return svc.serviceEndpoint;
}

export async function resolveActorFull(actor) {
  const did = await resolveActor(actor);
  const pdsUrl = await resolvePds(did);
  let handle = String(actor || "").replace(/^@/, "");
  let displayName = "";
  try {
    const prof = await jget(
      `${PUB}/app.bsky.actor.getProfile?actor=${encodeURIComponent(did)}`,
    );
    handle = prof.handle || handle;
    displayName = prof.displayName || "";
  } catch {}
  return { did, pdsUrl, handle, displayName };
}

// Function words carry no topic — a board built from "the / and / with"
// tells you nothing. Copied from bardposting's STOP list (same internet-chat
// tuning), which already earns its keep there.
const STOP = new Set(
  ("a an and are as at be been being but by can cant could did do does doing dont " +
    "for from had has have having he her hers herself him himself his how i if im in " +
    "into is it its itself just like me more most my myself no nor not of off on once " +
    "only or other our ours out over own re s same she should so some such t than that " +
    "the their theirs them then there these they this those to too up us ve very was we " +
    "were what when where which while who whom why will with would you your yours youre " +
    "youve about above after again against all also am any because been before below " +
    "between both down during each few further here ll m o ok oh yeah yes lol lmao " +
    "get got go going gonna want wanna know think really thing things one two " +
    "now new dont doesnt didnt isnt arent wasnt werent cant couldnt wouldnt shouldnt " +
    "actually maybe kinda sorta pretty much still even ever never always " +
    // social-media meta chatter: high-frequency in almost anyone's feed, so
    "post posts posting posted thread threads reply replies replying feed feeds " +
    // it drowns out a person's actual topics rather than being one itself.
    "timeline account bluesky twitter skeet skeets people person guy guys folks " +
    "feel feels feeling felt good bad great nice cool literally honestly genuinely " +
    "definitely probably basically kind sort stuff way ways lot lots bit part point " +
    "mean means meant said say says saying looks looking look seems seem " +
    "right wrong true false real fake big small little long short great bunch " +
    // generic high-frequency verbs: near-universal in any corpus of posts,
    // so they rank high by raw count without ever being a person's "topic."
    "make makes made making see saw seen seeing take takes took taking come " +
    "comes came coming give gives gave giving find finds found finding show " +
    "shows showed showing shown put puts putting keep keeps kept keeping let " +
    "lets letting start starts started starting stop stops stopped stopping " +
    "try tries tried trying call calls called calling ask asks asked asking " +
    "need needs needed needing become becomes became becoming turn turns " +
    "turned turning move moves moved moving live lives lived living happen " +
    "happens happened happening bring brings brought bringing write writes " +
    "wrote writing sit sits sat sitting stand stands stood standing pay pays " +
    "paid paying meet meets met meeting set sets setting learn learns " +
    "learned learning lead leads led leading watch watches watched watching " +
    "follow follows followed following stay stays stayed staying play plays " +
    "played playing run runs ran running hold holds held holding " +
    // generic time/quantity nouns: "three weeks" is filler, the topic is
    // whatever the three weeks were spent doing.
    "time times year years day days week weeks month months hour hours " +
    "minute minutes moment moments today tonight tomorrow yesterday " +
    // contraction leftovers, now that apostrophes are stripped before
    // splitting: "I've" -> "ive", "they're" -> "theyre", etc.
    "ive weve theyve theyre hes shes thats whats wheres hows whos theres heres aint " +
    // indefinite pronouns and other generic filler that ranks high by sheer
    // frequency without ever naming what a post is actually about.
    "someone somebody anyone everyone nobody something anything everything " +
    "nothing many much sure first last next another every back link com www http https")
    .split(/\s+/),
);

const HASHTAG_RE = /#([a-zA-Z][a-zA-Z0-9_]{1,30})/g;

// Tally a post's words into `counts`. Hashtags count extra — a poster who
// tags #cats is telling you outright that cats are the topic, worth more
// than an incidental mention.
function eat(text, counts) {
  const t = String(text || "");
  for (const m of t.matchAll(HASHTAG_RE)) {
    const w = m[1].toLowerCase();
    counts.set(w, (counts.get(w) || 0) + 3);
  }
  const words = t
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/@[\w.-]+/g, " ")
    .replace(/#\S+/g, " ")
    // drop apostrophes (straight + curly) BEFORE splitting on non-letters,
    // so "don't" collapses to "dont" (a token the stopword list already
    // knows) instead of splitting into the meaningless fragments "don"+"t".
    .replace(/['’]/g, "")
    .split(/[^\p{L}]+/u)
    .filter(Boolean);
  for (const w of words) counts.set(w, (counts.get(w) || 0) + 1);
}

// Merge simple plurals ("cats" -> "cat") so one habit doesn't split its own
// count across two board slots.
function mergePlurals(counts) {
  for (const w of Array.from(counts.keys())) {
    if (w.length < 5 || !w.endsWith("s")) continue;
    const base = w.slice(0, -1);
    if (counts.has(base)) {
      counts.set(base, counts.get(base) + counts.get(w));
      counts.delete(w);
    }
  }
}

export function isTopicWorthy(word) {
  if (word.length < 3 || word.length > 18) return false;
  if (STOP.has(word)) return false;
  if (!/[aeiou]/.test(word)) return false;
  return true;
}

// Walk the account's own repo via com.atproto.repo.listRecords, page by
// page, to exhaustion (cursor empty), capped only by MAX_FALLBACK_PAGES as a
// backstop against a pathological account. Used only when the CAR download
// below fails.
async function harvestViaRepo(actor, counts, onPage) {
  let cursor = "";
  let pages = 0;
  let posts = 0;
  for (; pages < MAX_FALLBACK_PAGES; pages++) {
    const u = new URL(`${actor.pdsUrl.replace(/\/$/, "")}/xrpc/com.atproto.repo.listRecords`);
    u.searchParams.set("repo", actor.did);
    u.searchParams.set("collection", "app.bsky.feed.post");
    u.searchParams.set("limit", "100");
    if (cursor) u.searchParams.set("cursor", cursor);
    let d;
    try {
      d = await jget(u.toString());
    } catch {
      break;
    }
    const recs = d.records || [];
    for (const rec of recs) {
      const text = rec.value && rec.value.text;
      if (!text) continue;
      posts++;
      eat(text, counts);
    }
    if (onPage) onPage(posts);
    cursor = d.cursor;
    if (!cursor || recs.length === 0) {
      pages++;
      break;
    }
  }
  return posts;
}

// Pull a person's ENTIRE post history and rank their most-mentioned topics.
// Tries one com.atproto.sync.getRepo CAR download first (this person's whole
// history in one request, no page cap), falling back to a paginated
// listRecords walk (to exhaustion) if the CAR path fails.
export async function harvestTopics(actor, { onPage } = {}) {
  const counts = new Map();
  eat(actor.displayName, counts);

  let posts = 0;
  try {
    const { records } = await fetchRepoRecords(actor.pdsUrl, actor.did, "app.bsky.feed.post");
    for (const rec of records) {
      if (!rec.text) continue;
      posts++;
      eat(rec.text, counts);
    }
    if (onPage) onPage(posts);
  } catch {
    posts = await harvestViaRepo(actor, counts, onPage);
  }

  mergePlurals(counts);

  const ranked = Array.from(counts.entries())
    .filter(([w]) => isTopicWorthy(w))
    .sort((a, b) => b[1] - a[1]);

  // Skip near-duplicates of a topic already picked (e.g. "photography" after
  // "photograph") so five slots aren't wasted on one idea said two ways.
  const topics = [];
  for (const [w, c] of ranked) {
    if (topics.length >= 5) break;
    const dup = topics.some(
      (t) => t.word.slice(0, 6) === w.slice(0, 6) && Math.min(t.word.length, w.length) >= 6,
    );
    if (!dup) topics.push({ word: w, count: c });
  }

  return { posts, topics };
}

// Filler topics for a quiet account whose real history doesn't fill five
// slots — better than a half-empty board.
const FALLBACK_TOPICS = [
  "bluesky", "mutuals", "screenshots", "reposts", "vibes", "threads",
  "takes", "feeds", "cassettes", "skeets",
];

export function padTopics(topics, seed) {
  const rng = mulberry32(hashStr(seed + ":pad"));
  const have = new Set(topics.map((t) => t.word));
  const pool = shuffled(FALLBACK_TOPICS.filter((w) => !have.has(w)), rng);
  const out = topics.slice();
  while (out.length < 5 && pool.length) out.push({ word: pool.shift(), count: 0 });
  return out;
}

// ── alliterative clue-writing ────────────────────────────────────────────
// One bank of plain descriptive words per starting letter. A clue draws
// three DISTINCT words from the topic's own letter, so every clue actually
// alliterates on the thing it's describing.
const TRAITS = {
  a: ["audacious", "absurd", "ancient", "abstract", "avid", "awkward", "astute", "arcane"],
  b: ["bizarre", "brazen", "baffling", "breezy", "bold", "blunt", "bashful", "booming"],
  c: ["chaotic", "curious", "cryptic", "cosmic", "crunchy", "classic", "cheeky", "careful"],
  d: ["daring", "dizzy", "dramatic", "dubious", "dreamy", "dogged", "droll", "dapper"],
  e: ["eccentric", "earnest", "elusive", "eerie", "exquisite", "eager", "elegant", "epic"],
  f: ["frantic", "fervent", "fickle", "florid", "fuzzy", "fearless", "feral", "fussy"],
  g: ["garrulous", "giddy", "gaudy", "grim", "gentle", "ghostly", "glib", "grand"],
  h: ["hasty", "haunting", "hearty", "hollow", "hushed", "hazy", "hectic", "humble"],
  i: ["iffy", "incessant", "icy", "irate", "idle", "impish", "intense", "ironic"],
  j: ["jittery", "jolly", "jaded", "jaunty", "jubilant", "jagged", "jazzy", "judicious"],
  k: ["keen", "kooky", "knotty", "kindly", "kinetic", "kindred"],
  l: ["lurid", "lofty", "loyal", "lush", "languid", "loud", "lonely", "lively"],
  m: ["murky", "mercurial", "modest", "moody", "meek", "mighty", "meticulous", "muted"],
  n: ["nervous", "nimble", "noble", "nosy", "nebulous", "niche", "notorious", "nostalgic"],
  o: ["obscure", "obstinate", "odd", "ornate", "ominous", "overt", "offbeat", "opulent"],
  p: ["peculiar", "potent", "precise", "petty", "playful", "persistent", "pensive", "pithy"],
  q: ["quaint", "quiet", "quick", "quirky", "querulous", "quixotic"],
  r: ["restless", "rowdy", "ruthless", "rigid", "radiant", "rustic", "raw", "reckless"],
  s: ["stubborn", "sly", "solemn", "spry", "stark", "subtle", "surreal", "swift"],
  t: ["tenacious", "tangled", "terse", "timid", "tireless", "tepid", "tender", "tricky"],
  u: ["uncanny", "unruly", "urgent", "unsung", "uneasy", "utter", "unhinged", "understated"],
  v: ["vivid", "volatile", "vague", "valiant", "vexing", "vintage", "vast", "vocal"],
  w: ["wary", "weary", "wistful", "wry", "wobbly", "wild", "wired", "whimsical"],
  x: ["xenial", "xeric", "x-rated"],
  y: ["yappy", "youthful", "yearning", "yielding", "yawning", "young"],
  z: ["zealous", "zany", "zesty", "zippy", "zonked"],
};

const CLOSERS = [
  "this is what {h}'s posts keep circling back to.",
  "this is the thing {h} cannot stop bringing up.",
  "this is what {h}'s timeline is secretly about.",
  "this is the through-line running under every post {h} makes.",
  "this is what {h} would talk about even if no one asked.",
];

function hashStr(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffled(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function cap(w) {
  return w.charAt(0).toUpperCase() + w.slice(1);
}

// Build one alliterative clue for a topic. `handle` fills the closing line;
// `seed` picks the word draw + closer (change it to re-roll).
export function clueFor(topic, handle, seed) {
  const letter = (topic.match(/[a-z]/) || ["b"])[0];
  const bank = TRAITS[letter] || TRAITS.b;
  const rng = mulberry32(hashStr(String(seed)));
  const draw = shuffled(bank, rng).slice(0, 3);
  while (draw.length < 3) draw.push(bank[draw.length % bank.length]);
  const closer = CLOSERS[Math.floor(rng() * CLOSERS.length)].replace(/\{h\}/g, "@" + handle);
  const line1 = `${cap(draw[0])}, ${draw[1]}, and utterly ${draw[2]} —`;
  return { line1, line2: closer };
}

export { hashStr, mulberry32, shuffled };
