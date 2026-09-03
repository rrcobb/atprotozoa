// villainy.js — scores one SimCluster member's public record (bio + recent
// posts) for villain-suitability. Real signal, unserious framing: same
// spirit as simcluster-alignment/public/lib/align.js, but instead of
// aggregating a cluster into one vector, each candidate is scored on their
// own against five axes and ranked.
//
// fetchPosts is trimmed from align.js's fetcher (public AppView, anonymous,
// CORS *, no auth).

const API = "https://public.api.bsky.app/xrpc/";

async function xrpc(method, params) {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(API + method + (qs ? "?" + qs : ""), { cache: "no-store" });
  if (!res.ok) {
    let msg = res.statusText;
    try { msg = (await res.json()).message || msg; } catch {}
    throw new Error(msg);
  }
  return res.json();
}

// Pulls one account's recent authored posts (skips reposts). One page (100
// posts) per candidate — plenty of signal for a vibe read, and it bounds how
// long a 10-40-person cluster scan takes in-browser (see CANDIDATE_CAP in
// app.js for the matching bound on how many candidates get read at all).
export async function fetchPosts(did, { pages = 1 } = {}) {
  const out = [];
  let cursor;
  for (let page = 0; page < pages; page++) {
    const params = { actor: did, limit: "100" };
    if (cursor) params.cursor = cursor;
    let data;
    try {
      data = await xrpc("app.bsky.feed.getAuthorFeed", params);
    } catch {
      break;
    }
    for (const item of data.feed || []) {
      if (item.reason) continue;
      const post = item.post;
      if (!post || !post.record || post.author?.did !== did) continue;
      out.push({
        text: post.record.text || "",
        createdAt: post.record.createdAt || post.indexedAt,
        isReply: !!post.record.reply,
      });
    }
    cursor = data.cursor;
    if (!cursor || !data.feed || !data.feed.length) break;
  }
  return out;
}

// Villain-coded vocabulary. Word-boundary matched, case-insensitive, against
// bio + post text. Deliberately broad (self-deprecating "unhinged little
// treat" posting counts same as a genuine "world domination" post) — this
// reads vibes, not intent.
const LEXICON = [
  "unhinged", "menace", "menacing", "chaos", "chaotic", "feral", "gremlin",
  "problematic", "evil", "wicked", "villain", "villainous", "scheme",
  "scheming", "plot", "plotting", "mastermind", "doom", "cursed", "wretched",
  "nefarious", "malice", "malicious", "sinister", "diabolical", "monster",
  "monstrous", "destroy", "betray", "betrayal", "revenge", "vengeance",
  "conquer", "tyrant", "tyranny", "despot", "hex", "curse", "poison",
  "venom", "fangs", "claws", "lair", "henchman", "henchmen", "minion",
  "minions", "antagonist", "unforgivable", "ruthless", "cruel", "cruelty",
  "spite", "spiteful", "petty", "grudge", "banish", "smite", "wrath",
  "rage", "fury", "manipulate", "manipulative", "unrepentant", "menacingly",
  "gaslight", "gaslighting", "final boss", "agent of chaos", "up to no good",
  "no remorse", "world domination", "burn it down", "reign of terror",
];
const LEXICON_RE = new RegExp(
  "\\b(" + LEXICON.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")\\b",
  "gi",
);

const VILLAIN_EMOJI = ["😈", "💀", "🔪", "🖤", "🕷️", "🐍", "👹", "🦹", "🦹‍♀️", "🦹‍♂️", "🔥", "👁️", "🌩️", "🩸", "⚰️", "🗡️"];
const CAPS_WORD_RE = /\b[A-Z]{4,}\b/;
// Common all-caps acronyms that shouldn't read as shouting.
const CAPS_WHITELIST = new Set(["LMAO", "LMFAO", "OMFG", "TBQH", "AFAIK", "IIRC", "FWIW", "NGL", "IMO", "IMHO"]);

function hasShoutingCaps(text) {
  const m = text.match(new RegExp(CAPS_WORD_RE, "g"));
  if (!m) return false;
  return m.some((w) => !CAPS_WHITELIST.has(w));
}

function countEmoji(text, list) {
  let n = 0;
  for (const e of list) {
    const parts = text.split(e);
    n += parts.length - 1;
  }
  return n;
}

// Builds one candidate's feature bundle from bio + recent posts.
export function extractFeatures(profile, posts) {
  const bio = profile.description || "";
  const bioBlob = bio + " " + bio; // weight bio ~2x a single post, it's a deliberate self-description
  const postCount = posts.length;

  let lexiconHits = countMatches(bioBlob) + posts.reduce((s, p) => s + countMatches(p.text || ""), 0);
  let shoutingPosts = 0, exclaimCount = 0, villainEmojiCount = 0, replyCount = 0;
  let nightPosts = 0, timedPosts = 0, lengthSum = 0;

  if (hasShoutingCaps(bio)) shoutingPosts += 0.5; // bio counts as half a "post" for this axis

  for (const p of posts) {
    const text = p.text || "";
    if (hasShoutingCaps(text)) shoutingPosts++;
    exclaimCount += (text.match(/!/g) || []).length;
    villainEmojiCount += countEmoji(text, VILLAIN_EMOJI);
    if (p.isReply) replyCount++;
    lengthSum += [...text].length;
    const hour = new Date(p.createdAt).getUTCHours();
    if (!isNaN(hour)) {
      timedPosts++;
      if (hour >= 0 && hour < 5) nightPosts++; // lair hours: midnight-5am UTC
    }
  }

  // Exhibit: the first post whose text trips the lexicon, for the dossier.
  let exhibit = null;
  for (const p of posts) {
    if (countMatches(p.text || "") > 0) { exhibit = p.text; break; }
  }
  if (!exhibit && countMatches(bio) > 0) exhibit = bio;

  return {
    postCount,
    lexiconRate: postCount ? lexiconHits / (postCount + 2) : lexiconHits / 2, // +2 smooths sparse accounts
    capsRate: postCount ? shoutingPosts / postCount : (hasShoutingCaps(bio) ? 1 : 0),
    exclaimRate: postCount ? exclaimCount / postCount : 0,
    emojiRate: postCount ? villainEmojiCount / postCount : 0,
    nightRate: timedPosts ? nightPosts / timedPosts : 0,
    replyRate: postCount ? replyCount / postCount : 0,
    avgLength: postCount ? lengthSum / postCount : 0,
    exhibit,
  };
}

function countMatches(text) {
  const m = String(text || "").match(LEXICON_RE);
  return m ? m.length : 0;
}

// Five axes, each 0-1. `label`/`archetype`/`glyph` drive the dossier UI.
export const AXES_META = {
  menace: { label: "schemes & plots", archetype: "The Mastermind", glyph: "\u{1F9E0}" },
  caps: { label: "monologue volume", archetype: "The Doomsayer", glyph: "\u{1F4E2}" },
  chaos: { label: "chaos emission", archetype: "Chaos Gremlin", glyph: "\u{1F480}" },
  nocturnal: { label: "lair-hours attendance", archetype: "The Night Operative", glyph: "\u{1F319}" },
  instigation: { label: "instigation", archetype: "The Instigator", glyph: "\u{1F525}" },
};

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

// Scores a candidate 0-100 with an axis breakdown and a dominant axis (the
// one that decides their archetype).
export function scoreVillain(feat) {
  const axes = [
    { key: "menace", value: clamp01(feat.lexiconRate / 1.5), weight: 0.4 },
    { key: "caps", value: clamp01(feat.capsRate * 2.5), weight: 0.15 },
    { key: "chaos", value: clamp01((feat.exclaimRate / 2 + feat.emojiRate) / 1.4), weight: 0.2 },
    { key: "nocturnal", value: clamp01(feat.nightRate / 0.55), weight: 0.1 },
    { key: "instigation", value: clamp01((feat.replyRate + feat.avgLength / 400) / 1.6), weight: 0.15 },
  ];
  const raw = axes.reduce((s, a) => s + a.value * a.weight, 0);
  const score = Math.round(clamp01(raw) * 100);
  const dominant = axes.reduce((a, b) => (b.value > a.value ? b : a));
  return {
    score,
    axes: axes.map((a) => ({ ...a, meta: AXES_META[a.key] })),
    dominant: { ...dominant, meta: AXES_META[dominant.key] },
  };
}

const TIERS = [
  { min: 75, name: "S-Tier Big Bad", verdict: "A finished antagonist. This account does not need coaching before opening night." },
  { min: 55, name: "Credible Threat", verdict: "Genuinely dangerous with a little polish. Recommend fast-tracking to worktrial." },
  { min: 35, name: "Henchperson Material", verdict: "Solid supporting-villain energy. Not a mastermind yet, but reliably shows up to cause a scene." },
  { min: 15, name: "Mostly Harmless Menace", verdict: "The vibes are there. The follow-through is not, yet." },
  { min: 0, name: "Not Even Trying", verdict: "Suspiciously well-adjusted. HR flags this for a wellness check, not a villain contract." },
];

export function tierFor(score) {
  return TIERS.find((t) => score >= t.min) || TIERS[TIERS.length - 1];
}
