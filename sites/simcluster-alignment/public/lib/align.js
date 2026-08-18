// align.js — simcluster-alignment's "spiritual diagnostic": pulls recent
// posts for a handle and everyone in its SimCluster pool (cluster.js), turns
// each account's post history into a feature bundle, sums the pool into one
// aggregate "communal mind" vector, then scores the handle against that
// aggregate on four axes — vocabulary resonance (cosine over word
// frequency), sigil communion (Jaccard over hashtags), tonal harmony
// (avg length / reply ratio / emoji rate distance), and temporal grounding
// (cosine over a 24-bucket UTC-hour histogram). Weighted average of whatever
// axes have data → one 0–100 "alignment" number. Feature extraction and the
// axis math are copied from simcluster-twin/public/lib/twin.js, which scores
// pairwise; this scores you against the whole cluster's summed signal
// instead of one other member.
//
// Everything reads Bluesky's public AppView anonymously (CORS *). No network
// calls in this file except fetchPosts.

const API = "https://public.api.bsky.app/xrpc/";
const PAGES_PER_ACCOUNT = 2; // up to 200 posts per account
export const MIN_POSTS = 5; // below this, an account is too sparse to read

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

// Pulls one account's recent authored posts (paginated, skips reposts).
export async function fetchPosts(did, { onStep, pages = PAGES_PER_ACCOUNT } = {}) {
  const out = [];
  let cursor;
  for (let page = 0; page < pages; page++) {
    onStep && onStep(`(${out.length} posts channeled so far)…`);
    const params = { actor: did, limit: "100" };
    if (cursor) params.cursor = cursor;
    let data;
    try {
      data = await xrpc("app.bsky.feed.getAuthorFeed", params);
    } catch {
      break;
    }
    for (const item of data.feed || []) {
      if (item.reason) continue; // a repost, not their own words
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

const STOPWORDS = new Set();
[
  "the","a","an","and","or","but","if","so","to","of","in","on","for","with",
  "at","by","from","as","is","are","was","were","be","been","being","this",
  "that","these","those","it","its","it's","im","i'm","you","your","youre",
  "you're","my","me","we","our","us","they","them","their","he","she","his",
  "her","not","no","yes","just","like","also","very","really","actually",
  "literally","kind","sort","thing","things","there","here","what","who",
  "when","where","why","how","all","any","some","more","most","other","one",
  "two","up","out","about","into","than","then","now","get","got","going",
  "go","do","did","does","doing","have","has","had","will","would","could",
  "should","can","cant","can't","dont","don't","didnt","didn't","im","ive",
  "i've","id","i'd","ill","i'll","because","cause","still","even","much",
  "many","lot","lots","over","again","back","down","off","only","own",
].forEach((w) => STOPWORDS.add(w));

function tokenize(text) {
  const words = [];
  const hashtags = [];
  const clean = (text || "")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/@[a-zA-Z0-9.-]+/g, " ");
  for (const m of clean.matchAll(/#[\p{L}\p{N}_]+/gu)) hashtags.push(m[0].slice(1).toLowerCase());
  const stripped = clean.replace(/#[\p{L}\p{N}_]+/gu, " ");
  for (const raw of stripped.toLowerCase().split(/[^\p{L}\p{N}']+/u)) {
    const w = raw.trim();
    if (w.length < 3 || w.length > 24) continue;
    if (STOPWORDS.has(w)) continue;
    if (/^\d+$/.test(w)) continue;
    words.push(w);
  }
  return { words, hashtags };
}

const EMOJI_RE = /\p{Extended_Pictographic}/gu;

// Builds one account's feature bundle out of its post list.
export function extractFeatures(posts) {
  const wordFreq = new Map();
  const hashtagFreq = new Map();
  const hourHist = new Array(24).fill(0);
  let totalWords = 0, totalHashtags = 0, replyCount = 0, emojiCount = 0;
  let lengthSum = 0, withText = 0;

  for (const p of posts) {
    const text = p.text || "";
    if (text.trim()) {
      withText++;
      lengthSum += [...text].length;
    }
    if (p.isReply) replyCount++;
    const emojiMatches = text.match(EMOJI_RE);
    if (emojiMatches) emojiCount += emojiMatches.length;

    const { words, hashtags } = tokenize(text);
    for (const w of words) {
      wordFreq.set(w, (wordFreq.get(w) || 0) + 1);
      totalWords++;
    }
    for (const h of hashtags) {
      hashtagFreq.set(h, (hashtagFreq.get(h) || 0) + 1);
      totalHashtags++;
    }
    const hour = new Date(p.createdAt).getUTCHours();
    if (!isNaN(hour)) hourHist[hour]++;
  }

  const postCount = posts.length;
  return {
    postCount,
    withText,
    wordFreq,
    totalWords,
    hashtagFreq,
    totalHashtags,
    hourHist,
    avgLength: withText ? lengthSum / withText : 0,
    replyRatio: postCount ? replyCount / postCount : 0,
    emojiRate: postCount ? emojiCount / postCount : 0,
    topWords: [...wordFreq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40).map(([w]) => w),
  };
}

// Sums a pool's feature bundles into one "communal mind" vector — the
// cluster's aggregate signal, not any one member's. Word/hashtag counts add;
// the hour histogram adds; the scalar style stats average, weighted by how
// many posts each member contributed.
export function aggregateFeatures(featList) {
  const wordFreq = new Map();
  const hashtagFreq = new Map();
  const hourHist = new Array(24).fill(0);
  let lengthWeighted = 0, replyWeighted = 0, emojiWeighted = 0, postCount = 0;

  for (const f of featList) {
    for (const [w, c] of f.wordFreq) wordFreq.set(w, (wordFreq.get(w) || 0) + c);
    for (const [h, c] of f.hashtagFreq) hashtagFreq.set(h, (hashtagFreq.get(h) || 0) + c);
    for (let i = 0; i < 24; i++) hourHist[i] += f.hourHist[i];
    lengthWeighted += f.avgLength * f.postCount;
    replyWeighted += f.replyRatio * f.postCount;
    emojiWeighted += f.emojiRate * f.postCount;
    postCount += f.postCount;
  }

  return {
    postCount,
    memberCount: featList.length,
    wordFreq,
    hashtagFreq,
    hourHist,
    avgLength: postCount ? lengthWeighted / postCount : 0,
    replyRatio: postCount ? replyWeighted / postCount : 0,
    emojiRate: postCount ? emojiWeighted / postCount : 0,
    topWords: [...wordFreq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40).map(([w]) => w),
  };
}

function cosine(mapA, mapB) {
  if (!mapA.size || !mapB.size) return null;
  let dot = 0, na = 0, nb = 0;
  for (const v of mapA.values()) na += v * v;
  for (const v of mapB.values()) nb += v * v;
  const [small, big] = mapA.size < mapB.size ? [mapA, mapB] : [mapB, mapA];
  for (const [k, v] of small) {
    const bv = big.get(k);
    if (bv) dot += v * bv;
  }
  if (!na || !nb) return null;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function cosineArr(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (!na || !nb) return null;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function jaccard(mapA, mapB) {
  if (!mapA.size && !mapB.size) return null;
  const a = new Set(mapA.keys()), b = new Set(mapB.keys());
  let inter = 0;
  for (const k of a) if (b.has(k)) inter++;
  const union = a.size + b.size - inter;
  return union ? inter / union : null;
}

// Each axis carries the spiritual dressing the reading is built from: an
// element, the chakra it's said to rule, and a glyph for the readout.
export const AXES_META = {
  vocabulary: { label: "vocabulary resonance", element: "Air", chakra: "Throat Chakra", glyph: "\u{1F701}" },
  hashtags: { label: "sigil communion", element: "Fire", chakra: "Third Eye", glyph: "\u{1F702}" },
  style: { label: "tonal harmony", element: "Water", chakra: "Heart Chakra", glyph: "\u{1F704}" },
  rhythm: { label: "temporal grounding", element: "Earth", chakra: "Root Chakra", glyph: "\u{1F703}" },
};

const ELEMENT_HUE = { Air: 189, Fire: 21, Water: 211, Earth: 140 };

// Scores `self` against the cluster's aggregate. Mirrors twin.js's compare()
// axis weighting, but the second operand is always the pool's summed
// vector, so this is one account vs. its whole SimCluster's signal.
export function align(self, cluster) {
  const wordSim = cosine(self.wordFreq, cluster.wordFreq);
  const hashtagSim = jaccard(self.hashtagFreq, cluster.hashtagFreq);
  const timeSim = cosineArr(self.hourHist, cluster.hourHist);

  const lengthDiff = Math.min(1, Math.abs(self.avgLength - cluster.avgLength) / 300);
  const replyDiff = Math.abs(self.replyRatio - cluster.replyRatio);
  const emojiDiff = Math.min(1, Math.abs(self.emojiRate - cluster.emojiRate) / 3);
  const styleSim = 1 - (lengthDiff + replyDiff + emojiDiff) / 3;

  const axes = [
    { key: "vocabulary", value: wordSim, weight: 0.5 },
    { key: "hashtags", value: hashtagSim, weight: 0.15 },
    { key: "style", value: styleSim, weight: 0.15 },
    { key: "rhythm", value: timeSim, weight: 0.2 },
  ];
  const present = axes.filter((x) => x.value !== null);
  const weightSum = present.reduce((s, x) => s + x.weight, 0) || 1;
  const raw = present.reduce((s, x) => s + x.value * x.weight, 0) / weightSum;
  const score = Math.round(Math.max(0, Math.min(1, raw)) * 100);

  let dominant = present.length ? present.reduce((a, b) => (b.value > a.value ? b : a)) : null;

  const sharedWords = [...self.wordFreq.keys()]
    .filter((w) => cluster.wordFreq.has(w))
    .sort((x, y) => (cluster.wordFreq.get(y) + self.wordFreq.get(y)) - (cluster.wordFreq.get(x) + self.wordFreq.get(x)))
    .slice(0, 8);
  const sharedTags = [...self.hashtagFreq.keys()].filter((t) => cluster.hashtagFreq.has(t)).slice(0, 6);
  const onlyYou = self.topWords.filter((w) => !cluster.wordFreq.has(w)).slice(0, 6);

  const selfPeakHour = self.hourHist.indexOf(Math.max(...self.hourHist));
  const clusterPeakHour = cluster.hourHist.indexOf(Math.max(...cluster.hourHist));

  return {
    score,
    axes: axes.map((x) => ({ ...x, meta: AXES_META[x.key] })),
    dominant: dominant ? { key: dominant.key, value: dominant.value, meta: AXES_META[dominant.key] } : null,
    sharedWords,
    sharedTags,
    onlyYou,
    selfPeakHour,
    clusterPeakHour,
    styleDeltas: { lengthDiff, replyDiff, emojiDiff },
  };
}

const BANDS = [
  {
    min: 85, name: "Fully Synced Node",
    verdict: "Your signal and the cluster's signal are the same signal. You didn't join the hivemind; you're one of the mouths it speaks through.",
  },
  {
    min: 65, name: "Harmonic Resonance",
    verdict: "Strong standing wave. When the cluster posts, some part of you was already halfway to typing the same thing.",
  },
  {
    min: 45, name: "Adjacent Frequency",
    verdict: "Same broadcast, different receiver angle. You're tuned close enough to pick up the chorus, not close enough to be indistinguishable from it.",
  },
  {
    min: 25, name: "Faint Signal",
    verdict: "You're on the same graph, technically. Spiritually you're standing near the door with your coat half on.",
  },
  {
    min: 0, name: "Off-Grid",
    verdict: "No detectable resonance. Either you're a true independent frequency, or the cluster simply hasn't noticed you're in the room yet.",
  },
];

export function bandFor(score) {
  return BANDS.find((b) => score >= b.min) || BANDS[BANDS.length - 1];
}

export function auraColor(dominant, score) {
  const hue = dominant ? ELEMENT_HUE[dominant.meta.element] : 265;
  const sat = 55 + Math.round((score / 100) * 40);
  const light = 42 + Math.round((score / 100) * 16);
  return `hsl(${hue}, ${sat}%, ${light}%)`;
}

function hourLabel(h) {
  if (h == null || h < 0) return "no clear hour";
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}${h < 12 ? "am" : "pm"} UTC`;
}

// Assembles the paragraph reading out of real numbers, in the site's voice:
// dry, specific, a little too confident for something this unscientific.
export function buildReading(handle, result, clusterMeta, selfPostCount) {
  const band = bandFor(result.score);
  const bits = [band.verdict];

  if (result.dominant) {
    bits.push(
      `Your strongest channel is ${result.dominant.meta.label} — ${result.dominant.meta.glyph} ${result.dominant.meta.element}, seated in the ${result.dominant.meta.chakra}.`
    );
  }

  if (result.sharedWords.length) {
    bits.push(`The cluster's mouth moves with yours on: ${result.sharedWords.slice(0, 5).join(", ")}.`);
  }
  if (result.sharedTags.length) {
    bits.push(`Shared sigils: ${result.sharedTags.slice(0, 4).map((t) => "#" + t).join(" ")}.`);
  }

  const hourGap = Math.min(
    Math.abs(result.selfPeakHour - result.clusterPeakHour),
    24 - Math.abs(result.selfPeakHour - result.clusterPeakHour)
  );
  if (hourGap <= 2) {
    bits.push(`You and the cluster peak at almost the same hour (you: ${hourLabel(result.selfPeakHour)}, cluster: ${hourLabel(result.clusterPeakHour)}) — circadianly, at least, you are one organism.`);
  } else if (hourGap >= 8) {
    bits.push(`Your circadian rhythm and the cluster's barely overlap (you: ${hourLabel(result.selfPeakHour)}, cluster: ${hourLabel(result.clusterPeakHour)}) — you may be spiritually aligned and still never see each other post live.`);
  }

  bits.push(
    `Read off ${clusterMeta.postCount.toLocaleString()} posts across ${clusterMeta.memberCount} cluster member(s), against your own ${selfPostCount} posts.`
  );

  return bits.join(" ");
}
