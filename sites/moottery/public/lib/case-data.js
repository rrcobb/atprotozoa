// case-data.js — turn a list of Bluesky handles into a moottery "case file":
// real profiles + real post excerpts, deterministically arranged into a
// Clue-style deduction round. Reads Bluesky's public AppView anonymously
// (no auth, CORS *). Copied and adapted from whodatninja/spy-data.js
// (copy, don't abstract).

const PUB = "https://public.api.bsky.app/xrpc";

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
// formats — copied from whodatninja/spy-data.js resolveDid.
export async function resolveDid(actor) {
  const a = (actor || "")
    .trim()
    .replace(/^@/, "")
    .replace(/^at:\/\//, "")
    .replace(/^https?:\/\/(bsky\.app\/profile\/)?/, "")
    .split("/")[0];
  if (!a) throw new Error("empty handle");
  if (a.startsWith("did:")) return a;
  const d = await jget(`${PUB}/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(a)}`);
  if (!d.did) throw new Error(`couldn't resolve "${a}"`);
  return d.did;
}

const STOPWORDS = new Set([
  "that", "this", "with", "from", "have", "just", "your", "about", "were",
  "they", "them", "their", "what", "when", "where", "which", "would",
  "could", "should", "there", "here", "then", "than", "also", "like",
  "really", "some", "been", "being", "because", "into", "only", "more",
  "most", "much", "very", "still", "even", "dont", "doesnt", "didnt",
  "cant", "wont", "youre", "theyre", "thats", "whats", "gonna", "kinda",
  "will", "such", "over", "back", "went", "going", "getting", "make",
  "made", "want", "need", "does", "http", "https",
]);

function qualifyingWords(text) {
  return (text || "")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^a-z0-9'\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !STOPWORDS.has(w));
}

// Fetch a handle's recent original posts (no replies, no reposts) with real
// prose worth quoting — long enough to redact interestingly, short enough
// to fit an evidence card.
async function loadPosts(did) {
  let feed = [];
  try {
    const d = await jget(
      `${PUB}/app.bsky.feed.getAuthorFeed?actor=${encodeURIComponent(did)}&limit=50&filter=posts_no_replies`,
    );
    feed = d.feed || [];
  } catch {
    feed = [];
  }
  const posts = [];
  for (const item of feed) {
    if (item.reason) continue; // skip reposts
    const post = item.post;
    if (!post || post.author?.did !== did) continue;
    const text = (post.record && post.record.text) || "";
    const clean = text.replace(/\s+/g, " ").trim();
    if (clean.length < 20 || clean.length > 240) continue;
    posts.push({ text: clean, uri: post.uri, indexedAt: post.indexedAt });
  }
  return posts;
}

// Lightweight profile-only resolve, for the suspect-picker chips (no post
// fetch — that only happens once the case is actually opened).
export async function resolveActor(actor) {
  const did = await resolveDid(actor);
  const profile = await jget(`${PUB}/app.bsky.actor.getProfile?actor=${encodeURIComponent(did)}`).catch(() => null);
  return {
    did,
    handle: (profile && profile.handle) || actor.replace(/^@/, ""),
    displayName: (profile && profile.displayName) || (profile && profile.handle) || actor,
    avatar: (profile && profile.avatar) || "",
  };
}

// Load one suspect's dossier: profile + qualifying posts + their most-used
// distinctive word (the "motive" flavor for their case-file card).
export async function loadSuspect(actor, { onStep } = {}) {
  if (onStep) onStep(`pulling @${actor.replace(/^@/, "")}'s file…`);
  const did = await resolveDid(actor);
  const [profile, posts] = await Promise.all([
    jget(`${PUB}/app.bsky.actor.getProfile?actor=${encodeURIComponent(did)}`).catch(() => null),
    loadPosts(did),
  ]);
  const handle = (profile && profile.handle) || actor.replace(/^@/, "");
  const wordCounts = new Map();
  for (const p of posts) {
    for (const w of qualifyingWords(p.text)) {
      wordCounts.set(w, (wordCounts.get(w) || 0) + 1);
    }
  }
  let topWord = "";
  let topCount = 0;
  for (const [w, c] of wordCounts) {
    if (c > topCount) {
      topWord = w;
      topCount = c;
    }
  }
  return {
    did,
    handle,
    displayName: (profile && profile.displayName) || handle,
    avatar: (profile && profile.avatar) || "",
    posts,
    topWord,
    postCount: posts.length,
  };
}

// ── deterministic PRNG, seeded from the case's suspect list — so the same
// set of handles always opens the same case file, letting a shared link
// serve as a shared puzzle instead of a coin flip per visitor. ──────────
function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
function mulberry32(seed) {
  let s = seed;
  return function () {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function pickOne(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}
function pickN(rng, arr, n) {
  const pool = arr.slice();
  const out = [];
  while (pool.length && out.length < n) {
    out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  }
  return out;
}

const CHARGES = [
  "left seventeen vague-posts and never once followed up",
  "liked their own alt's post at 3am and thought no one would notice",
  "ratio'd a mutual and called it an accident",
  "went dark on the group chat for six days, then said \"sorry, was busy\"",
  "screenshotted a DM without asking",
  "started a discourse purely to watch it burn",
  "unfollowed someone out of pure, quiet spite",
  "posted through it, visibly, for eleven hours straight",
  "reply-guyed a total stranger with unsolicited advice",
  "left read receipts on and regrets absolutely nothing",
  "quote-posted instead of just replying, and everyone saw it",
  "faved their own reply to make the ratio look better",
];

const REDACT_FRACS = [0.12, 0.45, 0.85];

function redact(text, frac) {
  const tokens = text.split(/(\s+)/);
  const wordTokenCount = tokens.filter((t) => !/^\s+$/.test(t)).length;
  const keepN = Math.max(1, Math.round(wordTokenCount * frac));
  let seen = 0;
  return tokens
    .map((t) => {
      if (/^\s+$/.test(t)) return t;
      seen++;
      if (seen <= keepN || t.length <= 2) return t;
      return "█".repeat(Math.min(t.length, 8));
    })
    .join("");
}

function distinctiveWord(text) {
  const ws = qualifyingWords(text);
  return ws.sort((a, b) => b.length - a.length)[0] || "something unspeakable";
}

// Build the case file from loaded suspect dossiers. Deterministic in the
// solution/evidence/charge — NOT in anything the player controls — so
// opening the same handle list twice (or from two different browsers via a
// shared link) always produces the same puzzle.
export function buildCase(suspects) {
  const withEvidence = suspects.filter((s) => s.posts.length > 0);
  if (withEvidence.length === 0) {
    throw new Error("none of these suspects have public posts worth quoting — try different handles.");
  }
  const seed = fnv1a(suspects.map((s) => s.did).sort().join("|"));
  const rng = mulberry32(seed);

  const solution = pickOne(rng, withEvidence);
  const evidencePool = pickN(rng, solution.posts, 3);
  while (evidencePool.length < 3) evidencePool.push(evidencePool[0]);

  const rounds = REDACT_FRACS.map((frac, i) => ({
    round: i + 1,
    fullText: evidencePool[i].text,
    redactedText: redact(evidencePool[i].text, frac),
    frac,
  }));

  const crime = pickOne(rng, CHARGES);
  const motive = solution.topWord || "a vibe nobody can quite name";
  const weapon = distinctiveWord(evidencePool[0].text);
  const caseId = seed.toString(16).toUpperCase().padStart(8, "0").slice(0, 6);

  return {
    suspects,
    solutionDid: solution.did,
    rounds,
    charge: { crime, motive, weapon },
    caseId,
  };
}
