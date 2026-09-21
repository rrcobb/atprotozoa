// jeoparody.js — pick a Bluesky handle, pick a slice of their posts (recent /
// most-liked / most-reposted), and rephrase one as a "Jen Kenning": a real
// kenning (a compound noun standing in for the post's topic) laid out on a
// four-stress Old English alliterative line, per elfprince13's original
// alliterative-Jeopardy-clue-bot spec — three stresses alliterating, the
// fourth running free.
//
// Runs entirely CLIENT-SIDE against the public AppView, anonymously (no
// auth, no worker, no secrets). identity resolution copied from
// sites/bardposting/public/lib/sonnet.js.

const PUB = "https://api.bsky.app/xrpc";
const PLC_DIR = "https://plc.directory";

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

// ── topic extraction ────────────────────────────────────────────────────
// Function words carry no topic. Copied from bardposting's STOP list (same
// internet-chat tuning), which already earns its keep there.
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
    "post posts posting posted thread threads reply replies replying feed feeds " +
    "timeline account bluesky twitter skeet skeets people person guy guys folks " +
    "feel feels feeling felt good bad great nice cool literally honestly genuinely " +
    "definitely probably basically kind sort stuff way ways lot lots bit part point " +
    "mean means meant said say says saying looks looking look seems seem " +
    "right wrong true false real fake big small little long short great bunch " +
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
    "time times year years day days week weeks month months hour hours " +
    "minute minutes moment moments today tonight tomorrow yesterday " +
    "ive weve theyve theyre hes shes thats whats wheres hows whos theres heres aint " +
    "someone somebody anyone everyone nobody something anything everything " +
    "nothing many much sure first last next another every back link com www http https")
    .split(/\s+/),
);

const HASHTAG_RE = /#([a-zA-Z][a-zA-Z0-9_]{1,30})/g;

// Tally a text's words into `counts`. Hashtags count extra — a poster who
// tags #cats is telling you outright that cats are the topic.
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
    .replace(/['’]/g, "")
    .split(/[^\p{L}]+/u)
    .filter(Boolean);
  for (const w of words) counts.set(w, (counts.get(w) || 0) + 1);
}

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

// The single most-mentioned worthy word in one post's text — the "topic" a
// Jen Kenning gets built around.
export function topTopicFromText(text) {
  const counts = new Map();
  eat(text, counts);
  mergePlurals(counts);
  const ranked = Array.from(counts.entries())
    .filter(([w]) => isTopicWorthy(w))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return ranked.length ? ranked[0][0] : null;
}

// A handful of posts are topic-free by the above rule (an image with no
// caption, a single emoji, a link-only post) — this is the fallback bank for
// exactly that case, not a cap on anything: every post still gets *a*
// deterministic word to build a kenning around.
const FALLBACK_WORDS = [
  "mystery", "silence", "moment", "glimpse", "static", "riddle", "murmur",
  "notion", "omen", "echo",
];
function fallbackTopic(seed) {
  const rng = mulberry32(hashStr(seed + ":fallback"));
  return FALLBACK_WORDS[Math.floor(rng() * FALLBACK_WORDS.length)];
}

// ── fetching candidate posts ────────────────────────────────────────────
const PAGE_LIMIT = 100;
const RECENT_LIMIT = 5;
const TOP_LIMIT = 5;

// Like/repost counts are computed by the AppView, not stored in the raw repo
// record, so there's no com.atproto.sync.getRepo bulk equivalent here the
// way there is for raw post text elsewhere in this repo — finding the
// genuinely most-liked/most-reposted post means walking
// app.bsky.feed.getAuthorFeed to exhaustion. Page cap matches the
// GRAPH_PAGES precedent (notes, "no arbitrary caps"): large enough that a
// real account's full feed never reaches it, not a "felt safe" number.
const MAX_FEED_PAGES = 400;

async function fetchFeedPage(actor, cursor) {
  const u = new URL(`${PUB}/app.bsky.feed.getAuthorFeed`);
  u.searchParams.set("actor", actor.did);
  u.searchParams.set("limit", String(PAGE_LIMIT));
  u.searchParams.set("filter", "posts_no_replies");
  if (cursor) u.searchParams.set("cursor", cursor);
  return jget(u.toString());
}

// Keep only posts the actor actually wrote themselves — drop reposts of
// other people's posts (marked with a `reason`) and anything misattributed.
function ownPost(item, actor) {
  return !!(item.post && item.post.author && item.post.author.did === actor.did && !item.reason);
}

function toCandidate(post) {
  const rkey = post.uri.split("/").pop();
  return {
    uri: post.uri,
    text: (post.record && post.record.text) || "",
    likeCount: post.likeCount || 0,
    repostCount: post.repostCount || 0,
    indexedAt: post.indexedAt,
    href: `https://bsky.app/profile/${post.author.handle}/post/${rkey}`,
  };
}

// mode: "recent" (just the latest page, already newest-first) or "liked" /
// "reposted" (walk the whole feed to exhaustion and rank by that count).
export async function fetchCandidates(actor, mode, { onPage } = {}) {
  if (mode === "recent") {
    const d = await fetchFeedPage(actor, "");
    const items = (d.feed || []).filter((it) => ownPost(it, actor));
    return {
      candidates: items.slice(0, RECENT_LIMIT).map((it) => toCandidate(it.post)),
      scanned: items.length,
    };
  }

  const key = mode === "liked" ? "likeCount" : "repostCount";
  let cursor = "";
  let scanned = 0;
  const all = [];
  for (let page = 0; page < MAX_FEED_PAGES; page++) {
    const d = await fetchFeedPage(actor, cursor);
    const items = (d.feed || []).filter((it) => ownPost(it, actor));
    for (const it of items) all.push(it.post);
    scanned += items.length;
    if (onPage) onPage(scanned);
    cursor = d.cursor;
    if (!cursor || !(d.feed || []).length) break;
  }
  all.sort((a, b) => (b[key] || 0) - (a[key] || 0));
  return { candidates: all.slice(0, TOP_LIMIT).map(toCandidate), scanned };
}

// ── alliterative kenning-writing ────────────────────────────────────────
// Per elfprince13's original spec: a real kenning — a compound noun standing
// in for the topic, e.g. "whale-road" for the sea — laid out on a real
// four-stress Old English alliterative line. A long line has two half-lines
// split by a caesura; of its four stresses, the two in the first half-line
// alliterate with each other AND with the first stress of the second
// half-line, while the fourth stress is free:
//   [kenning noun]  [adj2]   //   [adj3]   [free word]
//    stress 1        stress 2      stress 3   stress 4 (no constraint)
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

// The alliterating half of the kenning — a concrete noun per starting
// letter, standing in for "whale" in "whale-road."
const NOUNS = {
  a: ["anchor", "antler", "almanac", "anthem", "aurora"],
  b: ["banner", "bramble", "beacon", "brook", "bellows"],
  c: ["cinder", "current", "compass", "cauldron", "chorus"],
  d: ["drift", "dagger", "dovecote", "drum", "dusk"],
  e: ["ember", "echo", "elm", "engine", "eclipse"],
  f: ["forge", "flame", "ferry", "fable", "frost"],
  g: ["gale", "garden", "gavel", "glacier", "gramophone"],
  h: ["hearth", "harbor", "hollow", "hymn", "hatchet"],
  i: ["icicle", "idol", "inkwell", "island", "ivy"],
  j: ["jetty", "jukebox", "jasper", "journal", "jamboree"],
  k: ["kiln", "kettle", "kestrel", "kingdom", "knapsack"],
  l: ["lantern", "ledger", "loom", "lighthouse", "lyre"],
  m: ["mast", "mirror", "meadow", "millstone", "mist"],
  n: ["needle", "nest", "nebula", "nightjar", "notebook"],
  o: ["oracle", "oak", "orchard", "oarlock", "omen"],
  p: ["pendulum", "pyre", "pier", "prism", "pilgrim"],
  q: ["quarry", "quill", "quiver", "quay", "quartz"],
  r: ["raven", "rampart", "reef", "river", "relic"],
  s: ["spindle", "scepter", "smokestack", "shrine", "satchel"],
  t: ["tinder", "tower", "talisman", "tide", "totem"],
  u: ["urn", "undertow", "umbrella", "utopia", "understudy"],
  v: ["vault", "valley", "vessel", "vine", "volcano"],
  w: ["warren", "weathervane", "well", "whirlpool", "wick"],
  x: ["xylophone"],
  y: ["yardstick", "yurt", "yew"],
  z: ["ziggurat", "zephyr", "zeppelin"],
};

// The kenning's non-alliterating second element — any of these can follow
// any letter's noun ("cauldron-hoard", "banner-hoard", ...).
const KENNING_TAILS = [
  "hoard", "road", "song", "flame", "tide", "thread", "shadow", "storm",
  "bloom", "forge", "chorus", "cinder", "omen", "weave", "echo", "ember",
  "drift", "bell", "veil", "spark", "crown", "gale", "husk", "loom",
  "keeper", "bearer",
];

// The line's fourth stress — deliberately NOT alliteration-constrained, so
// the line ends on a free stress the way the form calls for.
const FREEWORDS = [
  "unbidden", "unasked", "unresting", "unsleeping", "nightly", "daily",
  "forever", "onward", "untold", "unnamed", "nameless", "endless",
  "tireless", "restless", "boundless", "ceaseless", "undimmed", "unbroken",
  "undying", "again",
];

// Closes out the translation by naming whose post this is — Jen Kenning's
// persona is a translator, not a quizmaster, so these read as "here's the
// alliterative version" rather than the old "guess the answer" framing.
const CLOSERS = [
  "that's @{h}'s post, run through Jen Kenning.",
  "Jen Kenning's translation of what @{h} just posted.",
  "@{h} said it in prose; here it is in kenning.",
  "same post, alliterating now.",
  "Jen Kenning read @{h}'s post so you don't have to parse the kenning.",
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

// Build one Jen Kenning for a post: `topic` is its extracted subject word
// (falls back to a deterministic filler word for a topic-free post — see
// fallbackTopic above), `handle` fills the closing line, `seed` picks the
// word draw + closer (change it to re-roll).
export function kenningForPost(topic, handle, seed) {
  const word = topic || fallbackTopic(String(seed));
  const letter = (word.match(/[a-z]/) || ["b"])[0];
  const adjBank = TRAITS[letter] || TRAITS.b;
  const nounBank = NOUNS[letter] || NOUNS.b;
  const rng = mulberry32(hashStr(String(seed)));

  const pool = adjBank.concat(nounBank);
  const draw = shuffled(pool, rng).slice(0, 3);
  while (draw.length < 3) draw.push(pool[draw.length % pool.length]);
  const [kenningNoun, adj2, adj3] = draw;
  const tail = shuffled(KENNING_TAILS, rng)[0];
  const freeword = shuffled(FREEWORDS, rng)[0];

  const kenning = `${cap(kenningNoun)}-${tail}`;
  const line1 = `${kenning}, ${adj2} — ${adj3}, ${freeword}.`;
  const closer = CLOSERS[Math.floor(rng() * CLOSERS.length)].replace(/\{h\}/g, handle);
  return { line1, line2: closer, kenning, stresses: [kenningNoun, adj2, adj3, freeword] };
}

export { hashStr, mulberry32, shuffled };
