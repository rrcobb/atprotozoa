// sonnet.js — weave a Shakespearean sonnet out of a Bluesky handle's own words.
//
// Runs entirely CLIENT-SIDE against the public AppView + PDS, anonymously
// (no auth, no worker, no secrets):
//   resolveActorFull(handle) → { did, pdsUrl, handle, displayName }
//   harvestWords(actor)      → a pool of that person's distinctive words
//   sonnetFor(pool, name, seed) → 14 lines, ABAB CDCD EFEF GG
//
// The rhyme and meter live entirely in HAND-WRITTEN scaffolds; the person's own
// words are slotted only into mid-line {w} positions, never at a line end, so
// the rhyme scheme is never disturbed no matter what vocabulary comes back.
//
// AppView host trick copied from trigrams/trigruessr (see notes/70): the
// anonymous `api.bsky.app` serves getProfile/listRecords with CORS *, whereas
// `public.api.bsky.app` 403s some of it. So we hit api.bsky.app throughout.

import { fetchRepoRecords } from "./car.js";

const PUB = "https://api.bsky.app/xrpc";
const PLC_DIR = "https://plc.directory";
const MAX_POST_PAGES = 8; // ≤ ~800 recent posts — plenty of vocabulary, stays fast

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
// formats (copied from trigruessr's resolveActor).
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
  let description = "";
  try {
    const prof = await jget(
      `${PUB}/app.bsky.actor.getProfile?actor=${encodeURIComponent(did)}`,
    );
    handle = prof.handle || handle;
    displayName = prof.displayName || "";
    description = prof.description || "";
  } catch {}
  return { did, pdsUrl, handle, displayName, description };
}

// Lowercase, drop URLs / @handles / #-marks, split on any non-letter run.
function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/@[\w.-]+/g, " ")
    .replace(/[#]/g, " ")
    .split(/[^\p{L}]+/u)
    .filter(Boolean);
}

// Function words carry no imagery — a sonnet built from "the / and / with" is
// mush. This list is generous on purpose; the point is to surface CONTENT words.
const STOP = new Set(
  ("a an and are as at be been being but by can cant could did do does doing dont " +
    "for from had has have having he her hers herself him himself his how i if im in " +
    "into is it its itself just like me more most my myself no nor not of off on once " +
    "only or other our ours out over own re s same she should so some such t than that " +
    "the their theirs them then there these they this those to too up us ve very was we " +
    "were what when where which while who whom why will with would you your yours youre " +
    "youve about above after again against all also am any because been before below " +
    "between both down during each few further here ll m o ok oh yeah yes lol lmao " +
    "get got go going going gonna want wanna know think really thing things gonna one two " +
    "now new dont doesnt didnt isnt arent wasnt werent cant couldnt wouldnt shouldnt " +
    "actually maybe kinda sorta pretty much still even ever never always")
    .split(/\s+/),
);

// A word's fitness for a sonnet slot. Prefer real content words of a readable
// length; taper the very short and the very long. Frequency gives a gentle
// nudge (a word they use is more "theirs") but we cap it so one repeated word
// doesn't dominate — variety reads better than a single tic.
function wordScore(word, count) {
  const len = word.length;
  if (len < 4 || len > 13) return -1;
  if (STOP.has(word)) return -1;
  if (!/[aeiou]/.test(word)) return -1; // no vowel → not a word we can sing
  let lenBump;
  if (len <= 5) lenBump = (len - 3) / 2; // 0.5 .. 1.0
  else if (len <= 8) lenBump = 1; // sweet spot
  else lenBump = Math.max(0.2, 1 - (len - 8) * 0.15);
  return lenBump + Math.min(count, 4) * 0.25;
}

// Walk the account's own repo via com.atproto.repo.listRecords, page by
// page, capped at MAX_POST_PAGES (~800 recent posts — plenty of vocabulary,
// but not this person's whole history). Used only when the CAR download
// below fails (parse error, oversized repo, a PDS that blocks sync.getRepo).
async function harvestWordsViaRepo(actor, eat, onPage) {
  let cursor = "";
  let pages = 0;
  let posts = 0;
  for (; pages < MAX_POST_PAGES; pages++) {
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
      eat(text);
    }
    if (onPage) onPage(pages + 1, posts);
    cursor = d.cursor;
    if (!cursor || recs.length === 0) {
      pages++;
      break;
    }
  }
  return { posts, pages };
}

// Pull a person's own posts + profile blurb and rank their distinctive words.
// onPage(pages, posts) lets the UI show progress. Returns a de-duplicated pool
// of content words, best first.
//
// Tries one com.atproto.sync.getRepo CAR download first — a bigger, richer
// word pool from the account's *entire* history in one request, rather than
// the ~800-post window MAX_POST_PAGES allows — falling back to the paginated
// listRecords walk if the CAR path fails.
export async function harvestWords(actor, { onPage } = {}) {
  const counts = new Map();
  const eat = (text) => {
    for (const w of tokenize(text)) counts.set(w, (counts.get(w) || 0) + 1);
  };
  eat(actor.displayName);
  eat(actor.description);

  let posts = 0;
  let pages = 0;
  try {
    const { records } = await fetchRepoRecords(actor.pdsUrl, actor.did, "app.bsky.feed.post");
    for (const rec of records) {
      if (!rec.text) continue;
      posts++;
      eat(rec.text);
    }
    if (onPage) onPage(1, posts);
  } catch {
    ({ posts, pages } = await harvestWordsViaRepo(actor, eat, onPage));
  }

  const scored = [];
  for (const [w, c] of counts) {
    const s = wordScore(w, c);
    if (s > 0) scored.push({ w, s });
  }
  scored.sort((a, b) => b.s - a.s);
  return { posts, pages, words: scored.map((x) => x.w) };
}

// ── the sonnets ───────────────────────────────────────────────────────────────
// Three complete Shakespearean scaffolds. {w} = a slot for one of the subject's
// own words (filled at generation time); {name} = the subject's name. Every {w}
// sits mid-line, so the fixed line-ending rhymes (ABAB CDCD EFEF GG) always hold.

const SCAFFOLDS = [
  {
    // Sonnet 18, wearing the subject's vocabulary. Opens and closes on the
    // real thing — the middle is all theirs.
    key: "summer",
    lines: [
      "Shall I compare thee to a summer's day?",
      "Thy {w} is more lovely and more bold;",
      "no rough and sudden {w} shakes the May,",
      "thy {w} outshines the summer's fading gold.",
      "Sometime too hot the {w} of heaven's beam,",
      "and oft the {w} of the divine is dimmed;",
      "but thou art constant as thy {w}'s bright stream,",
      "and every {w} thou post'st is fairly limned.",
      "Thy deathless {w} shall never fall to shade,",
      "nor shall the {w} of thy features go;",
      "for in these lines thy {w} is remade,",
      "and here thy {w} shall evermore so grow.",
      "So long as feeds can scroll and eyes can see,",
      "so long lives this, and this gives life to thee.",
    ],
  },
  {
    // The acausal sonnet — a nod to the thread this bot was tagged in
    // ("started posting acausally"). A verse that arrives before its cause.
    key: "acausal",
    lines: [
      "Before thy {w} had won its just renown,",
      "thou wert a {w}, a spark of quiet fire,",
      "and yet the {w} thy every post hath sown",
      "did teach the very {w} to aspire.",
      "What {w} is this? No mortal tongue can tell",
      "the {w} and {w} thou postest day by day;",
      "in thee both {w} and {w} fitly dwell,",
      "and time itself doth bend beneath thy sway.",
      "No {w} nor {w} could my devotion move;",
      "thou art the {w} of every waking dream.",
      "Thou post'st acausally, and so, my love,",
      "thy words arrive upon tomorrow's stream.",
      "So though the timeline burn and feeds grow tame,",
      "this verse shall keep the brightness of thy name.",
    ],
  },
  {
    // The comparison, closing on vgel's line: "more biskly and more buildish."
    key: "bisk",
    lines: [
      "Let others sing the {w} of yesterday,",
      "and boast their {w} of a nobler kind;",
      "I have no need of their {w} or their ways,",
      "for all the {w} I seek in thee I find.",
      "More {w} and more {w} than I have found",
      "in any soul that walks this weary sphere,",
      "thy {w} is by the whole wide world thus crowned,",
      "thy {w} makes the very heavens clear.",
      "Thou art my {w} in the longest night,",
      "the {w} to which my quiet hours belong;",
      "thy {w} is a small and stubborn light,",
      "thy {w} the burden of my every song.",
      "And so, {name}, this I write and shall not mend:",
      "thou art more bisk, more build, and more my friend.",
    ],
  },
];

// Elizabethan fallbacks — used when a person's own word pool runs dry (a quiet
// account, a fresh one). Keeps the sonnet whole rather than half-empty.
const FALLBACK = [
  "grace", "spirit", "fortune", "beauty", "wonder", "measure", "reason",
  "passion", "temper", "candor", "fervor", "vision", "labour", "verdure",
  "counsel", "raiment", "figure", "cadence", "murmur", "ardour", "silence",
  "colour", "kingdom", "mercy", "valour", "tempest", "harvest", "glimmer",
];

// A tiny seeded PRNG so a given handle yields the same sonnet every time (nice
// for shareable links), while "another" can re-roll with a fresh seed.
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

// Build one sonnet. `words` is the harvested pool; `name` the subject; `seed`
// picks the scaffold and the word draw (change it to re-roll).
export function sonnetFor(words, name, seed) {
  const rng = mulberry32(hashStr(String(seed)));
  const scaffold = SCAFFOLDS[Math.floor(rng() * SCAFFOLDS.length)];

  // Draw distinct words for the slots; fall back to the Elizabethan bank when
  // the pool is exhausted. Bias toward the person's most distinctive words by
  // keeping the top of the (already-ranked) pool in play, but shuffle within it.
  const top = words.slice(0, 60);
  const pool = shuffled(top.length >= 8 ? top : words.slice(), rng);
  const spare = shuffled(FALLBACK, rng);
  let pi = 0;
  let si = 0;
  const used = new Set();
  const draw = () => {
    while (pi < pool.length) {
      const w = pool[pi++];
      if (!used.has(w)) {
        used.add(w);
        return w;
      }
    }
    while (si < spare.length) {
      const w = spare[si++];
      if (!used.has(w)) {
        used.add(w);
        return w;
      }
    }
    return spare[Math.floor(rng() * spare.length)];
  };

  const nm = (name || "").trim() || "friend";
  const lines = scaffold.lines.map((line) =>
    line.replace(/\{name\}/g, nm).replace(/\{w\}/g, () => draw()),
  );
  return { lines, scaffold: scaffold.key };
}
