// compat.js — reads two public Bluesky accounts' real profile + recent post
// data (up to 100 posts and replies each) and their actual follow
// relationship, and turns it into a pop-psych-flavored "compatibility"
// reading: eight scored dimensions, a "love language" read per account, an
// attachment-style-flavored archetype per account, and one big headline
// percentage. Every number is a pure function of the fetched data — no dice
// rolls, no made-up stats — the only thing chosen rather than computed is
// which of several equally-true phrasings narrates a given score, and that
// choice is seeded off the pair's sorted DIDs (see brawl.js siblings'
// tieRng), so the same two handles always read the same way until one of
// them posts again.
//
// This is a toy, not a diagnostic instrument: "attachment style" and "love
// language" here are playful labels hung off real posting-cadence and
// reply-ratio numbers, not an actual psychological assessment. Say so in the
// UI, not just here.

const TE = new TextEncoder();

function hash32(str) {
  let h = 5381;
  for (const b of TE.encode(str)) h = ((h << 5) + h + b) >>> 0;
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

export function pairSeed(profileA, profileB) {
  return [profileA.did, profileB.did].sort().join("|");
}

function pick(profileA, profileB, key, list) {
  const rng = mulberry32(hash32(pairSeed(profileA, profileB) + "::" + key));
  return list[Math.floor(rng() * list.length) % list.length];
}

const EMOJI_RE = /\p{Extended_Pictographic}/gu;
const STOPWORDS = new Set(
  ("the a an and or but if of to in on for with is are was were be been being this that " +
    "it its i you he she they we my your his her their our me him them us as at by from " +
    "not no yes so just like get got have has had do does did will would can could should " +
    "there here what who when where why how all any some more most other into out up down " +
    "about than then also very really one two lol im ive dont didnt cant youre theyre its " +
    "ill hes shes were weve theyve amp rt via").split(" "),
);

function words(text) {
  return (text || "")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/@[a-z0-9.-]+/g, " ")
    .replace(/#[a-z0-9_]+/g, " ")
    .match(/[a-z']{4,}/g) || [];
}

function isReply(post) {
  return !!post.record?.reply;
}

function createdAtMs(post) {
  const t = Date.parse(post.record?.createdAt || post.indexedAt || "");
  return Number.isFinite(t) ? t : null;
}

function extractImages(post) {
  const embed = post.embed;
  if (!embed) return [];
  if (embed.$type === "app.bsky.embed.images#view") return embed.images || [];
  if (embed.$type === "app.bsky.embed.recordWithMedia#view" && embed.media?.$type === "app.bsky.embed.images#view") {
    return embed.media.images || [];
  }
  return [];
}

// --- per-account analysis, each a pure function of fetched posts/profile ---

function hourHistogram(posts) {
  const hist = new Array(24).fill(0);
  for (const p of posts) {
    const ms = createdAtMs(p);
    if (ms === null) continue;
    hist[new Date(ms).getUTCHours()]++;
  }
  return hist;
}

const HOUR_LABELS = [
  [0, 5, "3am gremlin"],
  [5, 9, "early bird"],
  [9, 12, "late-morning poster"],
  [12, 17, "afternoon drifter"],
  [17, 21, "evening regular"],
  [21, 24, "night owl"],
];
function peakInfo(hist) {
  const total = hist.reduce((a, b) => a + b, 0);
  if (!total) return { hour: null, label: "ghost mode", share: 0 };
  let hour = 0;
  for (let i = 1; i < 24; i++) if (hist[i] > hist[hour]) hour = i;
  const label = HOUR_LABELS.find(([lo, hi]) => hour >= lo && hour < hi)?.[2] || "unclassifiable";
  return { hour, label, share: hist[hour] / total };
}

function cadence(posts) {
  const times = posts.map(createdAtMs).filter((t) => t !== null).sort((a, b) => a - b);
  if (times.length < 2) return { postsPerDay: 0, gapCoV: 0, spanDays: 0 };
  const spanDays = Math.max((times[times.length - 1] - times[0]) / 86400000, 0.04);
  const gaps = [];
  for (let i = 1; i < times.length; i++) gaps.push((times[i] - times[i - 1]) / 3600000);
  const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  const variance = gaps.reduce((a, b) => a + (b - mean) ** 2, 0) / gaps.length;
  const gapCoV = mean > 0 ? Math.sqrt(variance) / mean : 0;
  return { postsPerDay: times.length / spanDays, gapCoV, spanDays };
}

function replyRatio(posts) {
  return posts.length ? posts.filter(isReply).length / posts.length : 0;
}

function emojiSet(posts) {
  const s = new Set();
  for (const p of posts) for (const e of (p.record?.text || "").match(EMOJI_RE) || []) s.add(e);
  return s;
}

function hashtagSet(posts) {
  const s = new Set();
  for (const p of posts) for (const t of (p.record?.text || "").match(/#[a-z0-9_]+/gi) || []) s.add(t.toLowerCase());
  return s;
}

function topWordSet(posts, bio, n = 50) {
  const counts = new Map();
  const bump = (w) => counts.set(w, (counts.get(w) || 0) + 1);
  for (const w of words(bio)) if (!STOPWORDS.has(w)) bump(w);
  for (const p of posts) for (const w of words(p.record?.text)) if (!STOPWORDS.has(w)) bump(w);
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
  return { set: new Set(top.map(([w]) => w)), top };
}

function altTextRate(posts) {
  let images = 0, withAlt = 0;
  for (const p of posts) {
    for (const img of extractImages(p)) {
      images++;
      if (img.alt && img.alt.trim()) withAlt++;
    }
  }
  return { rate: images ? withAlt / images : 0, images, withAlt };
}

function mediaRate(posts) {
  const withMedia = posts.filter((p) => extractImages(p).length > 0).length;
  return posts.length ? withMedia / posts.length : 0;
}

function punctRate(posts, re) {
  if (!posts.length) return 0;
  let hits = 0;
  for (const p of posts) hits += (p.record?.text || "").match(re)?.length || 0;
  return hits / posts.length;
}

function emojiRate(posts) {
  if (!posts.length) return 0;
  let hits = 0;
  for (const p of posts) hits += (p.record?.text || "").match(EMOJI_RE)?.length || 0;
  return hits / posts.length;
}

// love language: five real ratios, normalized against a soft ceiling and
// scored 0-100, highest wins. The ceilings are just "generous amount of this
// behavior" reference points, not derived from a corpus — same spirit as any
// horoscope-adjacent toy: a real number dressed up in a fun label.
const LOVE_LANGUAGES = [
  { key: "words", name: "Words of Affirmation", icon: "💬", from: (a) => Math.min(punctRate(a.posts, /!/g) / 0.6, 1) },
  { key: "service", name: "Acts of Service", icon: "🛠️", from: (a) => a.altText.rate },
  { key: "time", name: "Quality Time", icon: "⏳", from: (a) => Math.min(a.replyRatio / 0.35, 1) },
  { key: "gifts", name: "Gifts", icon: "🎁", from: (a) => Math.min(mediaRate(a.posts) / 0.4, 1) },
  { key: "touch", name: "Physical Touch", icon: "🤗", from: (a) => Math.min(emojiRate(a.posts) / 1.2, 1) },
];

export function analyzeAccount(profile, posts) {
  const hist = hourHistogram(posts);
  const peak = peakInfo(hist);
  const cad = cadence(posts);
  const rr = replyRatio(posts);
  const altText = altTextRate(posts);
  const words_ = topWordSet(posts, profile.description);
  const acct = {
    profile,
    posts,
    hist,
    peak,
    cadence: cad,
    replyRatio: rr,
    altText,
    emoji: emojiSet(posts),
    hashtags: hashtagSet(posts),
    words: words_,
  };
  const languages = LOVE_LANGUAGES.map((l) => ({ ...l, score: Math.round(l.from(acct) * 100) })).sort(
    (a, b) => b.score - a.score,
  );
  const chaosLabel = cad.gapCoV > 1.1 ? "chaotic" : cad.gapCoV > 0.6 ? "unpredictable" : "steady";
  const styleLabel = rr > 0.35 ? "responder" : rr > 0.12 ? "conversational" : "broadcaster";
  const attachment =
    rr > 0.3 && cad.gapCoV <= 0.85
      ? "Secure"
      : rr > 0.3 && cad.gapCoV > 0.85
        ? "Anxious-Preoccupied"
        : rr <= 0.3 && cad.gapCoV > 0.85
          ? "Avoidant"
          : "Fearful-Avoidant";
  acct.languages = languages;
  acct.primaryLanguage = languages[0];
  acct.archetype = `${peak.label}, ${chaosLabel} ${styleLabel}`;
  acct.attachment = attachment;
  return acct;
}

function jaccard(setA, setB) {
  if (!setA.size && !setB.size) return null;
  const inter = [...setA].filter((x) => setB.has(x)).length;
  const union = new Set([...setA, ...setB]).size;
  return union ? inter / union : 0;
}

function overlapCoefficient(histA, histB) {
  const totalA = histA.reduce((a, b) => a + b, 0);
  const totalB = histB.reduce((a, b) => a + b, 0);
  if (!totalA || !totalB) return null;
  let overlap = 0;
  for (let i = 0; i < 24; i++) overlap += Math.min(histA[i] / totalA, histB[i] / totalB);
  return overlap;
}

const DIMENSIONS = [
  {
    key: "orbit",
    icon: "🔗",
    name: "Already In Orbit",
    detail: "the real follow graph between them, not a vibe",
    score(a, b, rel) {
      if (rel.following && rel.followedBy) return { pct: 100, note: "mutuals — already following each other" };
      if (rel.following || rel.followedBy) return { pct: 55, note: "one-way follow — somebody made the first move" };
      return { pct: 15, note: "no follow either direction yet" };
    },
  },
  {
    key: "timezone",
    icon: "🌙",
    name: "Timezone Sync",
    detail: "overlap of their last 100 posts' hour-of-day, UTC",
    score(a, b) {
      const overlap = overlapCoefficient(a.hist, b.hist);
      if (overlap === null) return { pct: 50, note: "not enough recent posts to read a pattern" };
      return {
        pct: Math.round(overlap * 100),
        note: `${a.peak.label} meets ${b.peak.label}`,
      };
    },
  },
  {
    key: "chaos",
    icon: "🌀",
    name: "Chaos Compatibility",
    detail: "how similarly irregular their posting rhythm is",
    score(a, b) {
      const covA = a.cadence.gapCoV, covB = b.cadence.gapCoV;
      const denom = Math.max(covA, covB, 0.05);
      const pct = Math.round((1 - Math.abs(covA - covB) / denom) * 100);
      return { pct, note: `${describeChaos(covA)} × ${describeChaos(covB)}` };
    },
  },
  {
    key: "style",
    icon: "💬",
    name: "Communication Style",
    detail: "reply rate out of their last 100 posts — initiator vs. responder",
    score(a, b) {
      const pct = Math.round((1 - Math.abs(a.replyRatio - b.replyRatio)) * 100);
      return {
        pct,
        note: `${Math.round(a.replyRatio * 100)}% replies vs. ${Math.round(b.replyRatio * 100)}%`,
      };
    },
  },
  {
    key: "humor",
    icon: "🎭",
    name: "Humor Alignment",
    detail: "overlap of the actual emoji each of them reaches for",
    score(a, b) {
      const j = jaccard(a.emoji, b.emoji);
      if (j === null) return { pct: 50, note: "neither one uses emoji — a match by omission" };
      const shared = [...a.emoji].filter((e) => b.emoji.has(e)).slice(0, 6);
      return { pct: Math.round(j * 100), note: shared.length ? `share: ${shared.join(" ")}` : "no shared emoji" };
    },
  },
  {
    key: "vocabulary",
    icon: "📖",
    name: "Shared Vocabulary",
    detail: "overlap of their most-used non-filler words, bio included",
    score(a, b) {
      const j = jaccard(a.words.set, b.words.set);
      if (j === null) return { pct: 50, note: "not enough text to compare" };
      const shared = [...a.words.set].filter((w) => b.words.set.has(w)).slice(0, 6);
      return { pct: Math.round(j * 100), note: shared.length ? `share: ${shared.join(", ")}` : "no shared words" };
    },
  },
  {
    key: "tags",
    icon: "#️⃣",
    name: "Interest Overlap",
    detail: "overlap of hashtags used in their last 100 posts",
    score(a, b) {
      const j = jaccard(a.hashtags, b.hashtags);
      if (j === null) return { pct: 50, note: "neither one hashtags" };
      const shared = [...a.hashtags].filter((t) => b.hashtags.has(t)).slice(0, 5);
      return { pct: Math.round(j * 100), note: shared.length ? `share: ${shared.join(" ")}` : "no shared tags" };
    },
  },
  {
    key: "care",
    icon: "🤝",
    name: "Acts of Service",
    detail: "how similarly often they write real alt text on images",
    score(a, b) {
      if (!a.altText.images && !b.altText.images) return { pct: 50, note: "neither posts images" };
      const pct = Math.round((1 - Math.abs(a.altText.rate - b.altText.rate)) * 100);
      return {
        pct,
        note: `${Math.round(a.altText.rate * 100)}% of images alt-texted vs. ${Math.round(b.altText.rate * 100)}%`,
      };
    },
  },
];

function describeChaos(cov) {
  return cov > 1.1 ? "chaotic" : cov > 0.6 ? "unpredictable" : "steady";
}

const WEIGHTS = { orbit: 20, timezone: 12, chaos: 10, style: 12, humor: 14, vocabulary: 14, tags: 10, care: 8 };

const VERDICTS = [
  { min: 85, title: "Written In the Stars", lines: ["the data says go for it.", "rarely does the sync stat run this hot."] },
  { min: 70, title: "Strong Match", lines: ["a genuinely good pairing, numbers and all.", "not soulmates, but not nothing."] },
  { min: 50, title: "Could Work", lines: ["plausible, with a little effort.", "the vibes are there, mostly."] },
  { min: 30, title: "Chaotic Situationship", lines: ["technically possible. inadvisable.", "energy, if nothing else."] },
  { min: 0, title: "Respectfully, No", lines: ["the numbers are not on your side here.", "friends. maybe. this is friends."] },
];

// Judges a compatibility reading for two already-fetched accounts. `rel` is
// the follow relationship object from getRelationship(a.did, b.did). Every
// number is a pure function of the inputs, so the same two handles always
// produce the same reading until one of them posts (or follows) again.
export function runCompat(a, b, rel) {
  const results = DIMENSIONS.map((d) => ({ dim: d, ...d.score(a, b, rel) }));
  const overall = Math.round(
    results.reduce((sum, r) => sum + r.pct * WEIGHTS[r.dim.key], 0) / Object.values(WEIGHTS).reduce((x, y) => x + y, 0),
  );
  const tier = VERDICTS.find((v) => overall >= v.min);
  const line = pick(a.profile, b.profile, "verdict", tier.lines);
  return { results, overall, tier, verdictLine: line };
}
