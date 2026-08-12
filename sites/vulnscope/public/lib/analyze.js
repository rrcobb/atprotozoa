// analyze.js — turns a handle's public posts + outgoing follows (their
// actual atproto repo, read straight off their PDS for the follow-velocity
// signal) into a "matching" software vulnerability. It's a bit, not a real
// security tool: every weight below is hand-tuned for vibes, not research.
//
// Shape: extractFeatures() turns raw API responses into plain numeric stats.
// normalize() rescales those into 0..1 "signals." Each entry in VULNS carries
// a signature vector over those signals; pickVuln() dot-products every
// vulnerability against the account's signal vector and returns the best
// match, plus which signals drove the call (for the evidence list).

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

function fnv1a(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const HYPERBOLE = /\b(literally|actually|always|never|everyone|nobody|no one|insane|unhinged|obsessed|worst|best|dying|deadass|genuinely|100%|so real)\b/gi;
const GRUDGE = /\b(still can'?t believe|never forget|remember when|years later|to this day|still mad|still not over|calling it now|told you so)\b/gi;
const SELF = /\b(i|i'm|im|i've|ive|me|my|mine|myself)\b/gi;
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu;
const BOT_HANDLE = /^[a-z]+[0-9]{2,}\.bsky\.social$/i;

export function extractFeatures({ profile, feedItems, follows, followers, followRecords }) {
  const reposts = feedItems.filter((it) => it.reason?.$type === "app.bsky.feed.defs#reasonRepost");
  const own = feedItems.filter((it) => !it.reason);
  const posts = own.map((it) => it.post).filter(Boolean);
  const texts = posts.map((p) => p.record?.text || "");

  const postCount = posts.length;
  const totalChars = texts.reduce((s, t) => s + t.length, 0);
  const avgLen = postCount ? totalChars / postCount : 0;

  let upper = 0,
    letters = 0;
  for (const t of texts) {
    for (const w of t.split(/\s+/)) {
      const alpha = w.replace(/[^a-zA-Z]/g, "");
      if (alpha.length < 3) continue;
      letters += alpha.length;
      upper += (alpha.match(/[A-Z]/g) || []).length;
    }
  }
  const capsRatio = letters ? upper / letters : 0;

  let hyperboleHits = 0,
    grudgeHits = 0,
    selfRefHits = 0,
    emojiHits = 0,
    wordsTotal = 0,
    lateNightCount = 0;
  const wordCounts = new Map();
  for (const p of posts) {
    const t = p.record?.text || "";
    hyperboleHits += (t.match(HYPERBOLE) || []).length;
    grudgeHits += (t.match(GRUDGE) || []).length;
    selfRefHits += (t.match(SELF) || []).length;
    emojiHits += (t.match(EMOJI) || []).length;
    const words = t.toLowerCase().match(/[a-z']{3,}/g) || [];
    wordsTotal += words.length;
    for (const w of words) wordCounts.set(w, (wordCounts.get(w) || 0) + 1);
    const h = p.record?.createdAt ? new Date(p.record.createdAt).getUTCHours() : null;
    if (h !== null && h >= 0 && h < 5) lateNightCount++;
  }
  const uniqueWords = wordCounts.size;
  const repetition = wordsTotal ? 1 - uniqueWords / wordsTotal : 0;

  const replyCount = posts.filter((p) => p.record?.reply).length;
  const quoteCount = posts.filter((p) => {
    const t = p.record?.embed?.$type || "";
    return t === "app.bsky.embed.record" || t === "app.bsky.embed.recordWithMedia";
  }).length;

  const followsCount = profile.followsCount ?? follows.length;
  const followersCount = profile.followersCount ?? followers.length;
  const followerDids = new Set(followers.map((f) => f.did));
  const reciprocal = follows.filter((f) => followerDids.has(f.did)).length;
  const reciprocityRatio = follows.length ? reciprocal / follows.length : 0;

  const botFollows = follows.filter((f) => BOT_HANDLE.test(f.handle || "") || !f.displayName).length;
  const botFollowRatio = follows.length ? botFollows / follows.length : 0;

  const customDomainFollows = follows.filter((f) => f.handle && !f.handle.endsWith(".bsky.social")).length;
  const customDomainRatio = follows.length ? customDomainFollows / follows.length : 0;

  // Follow burst, read off the account's own repo (not the AppView): the
  // most follow records created within any single rolling 60-minute window.
  let maxBurst = followRecords.length ? 1 : 0;
  const times = followRecords
    .map((r) => Date.parse(r.value?.createdAt || ""))
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  let lo = 0;
  for (let hi = 0; hi < times.length; hi++) {
    while (times[hi] - times[lo] > 60 * 60 * 1000) lo++;
    maxBurst = Math.max(maxBurst, hi - lo + 1);
  }

  return {
    postCount,
    avgLen,
    capsRatio,
    hyperbolePerPost: postCount ? hyperboleHits / postCount : 0,
    grudgePerPost: postCount ? grudgeHits / postCount : 0,
    selfRefPer100Words: wordsTotal ? (selfRefHits / wordsTotal) * 100 : 0,
    emojiPerPost: postCount ? emojiHits / postCount : 0,
    repetition,
    replyRatio: postCount ? replyCount / postCount : 0,
    quoteRatio: postCount ? quoteCount / postCount : 0,
    repostRatio: feedItems.length ? reposts.length / feedItems.length : 0,
    lateNightRatio: postCount ? lateNightCount / postCount : 0,
    followsCount,
    followersCount,
    followSample: follows.length,
    reciprocityRatio,
    botFollowRatio,
    customDomainRatio,
    maxBurst,
    followRecordSample: followRecords.length,
  };
}

function normalize(f) {
  return {
    verbosity: clamp01(f.avgLen / 240),
    caps: clamp01(f.capsRatio / 0.12),
    hyperbole: clamp01(f.hyperbolePerPost / 0.5),
    grudge: clamp01(f.grudgePerPost / 0.08),
    repetition: clamp01((f.repetition - 0.3) / 0.4),
    replies: clamp01(f.replyRatio / 0.7),
    quotes: clamp01(f.quoteRatio / 0.35),
    reposts: clamp01(f.repostRatio / 0.5),
    selfRef: clamp01(f.selfRefPer100Words / 6),
    lateNight: clamp01(f.lateNightRatio / 0.35),
    followImbalance: clamp01(f.followsCount / (f.followersCount + 1) / 3),
    reciprocityHigh: clamp01(f.reciprocityRatio / 0.6),
    reciprocityGap: clamp01(1 - f.reciprocityRatio),
    botFollow: clamp01(f.botFollowRatio / 0.4),
    customDomain: clamp01(f.customDomainRatio / 0.5),
    burst: clamp01((f.maxBurst - 2) / 10),
    lurk: clamp01(1 - f.postCount / 25),
  };
}

const EVIDENCE = {
  verbosity: (f) => `average post runs ${Math.round(f.avgLen)} characters`,
  caps: (f) => `${Math.round(f.capsRatio * 100)}% of your letters are SHOUTING`,
  hyperbole: (f) => `${f.hyperbolePerPost.toFixed(2)} hyperbole flags per post ("literally", "always", "everyone"...)`,
  grudge: (f) => `${f.grudgePerPost.toFixed(2)} grudge callbacks per post ("still not over it", "years later"...)`,
  repetition: (f) => `${Math.round(f.repetition * 100)}% of your words repeat across your last ${f.postCount} posts`,
  replies: (f) => `${Math.round(f.replyRatio * 100)}% of what you post is a reply`,
  quotes: (f) => `${Math.round(f.quoteRatio * 100)}% quote-posts`,
  reposts: (f) => `${Math.round(f.repostRatio * 100)}% of your feed is reposts`,
  selfRef: (f) => `"I / me / my" shows up ${f.selfRefPer100Words.toFixed(1)}x per 100 words`,
  lateNight: (f) => `${Math.round(f.lateNightRatio * 100)}% of your posts land 12am-5am UTC`,
  followImbalance: (f) => `you follow ${f.followsCount}, only ${f.followersCount} follow you back`,
  reciprocityHigh: (f) => `${Math.round(f.reciprocityRatio * 100)}% of your sampled follows follow back`,
  reciprocityGap: (f) => `only ${Math.round(f.reciprocityRatio * 100)}% of your sampled follows follow back`,
  botFollow: (f) => `${Math.round(f.botFollowRatio * 100)}% of your sampled follows look generic or bot-shaped`,
  customDomain: (f) => `${Math.round(f.customDomainRatio * 100)}% of your follows live off a custom domain`,
  burst: (f) => `up to ${f.maxBurst} follow${f.maxBurst === 1 ? "" : "s"} written to your repo within a single hour`,
  lurk: (f) => `only ${f.postCount} posts turned up in your recent repo`,
};

export const VULNS = [
  {
    id: "sqli",
    cwe: "CWE-89",
    name: "SQL Injection",
    emoji: "\u{1F489}",
    tagline: "unsanitized opinions, inserted directly into every thread",
    weights: { quotes: 0.4, replies: 0.35, hyperbole: 0.25 },
    describe: (f) =>
      `You don't wait to be asked. A quote-post or a reply is an open input field, and you write straight through it — no escaping, no second thought, opinion injected directly into someone else's query. Most of the time the thread survives. Sometimes the whole table drops.`,
  },
  {
    id: "overflow",
    cwe: "CWE-120",
    name: "Buffer Overflow",
    emoji: "\u{1F4A5}",
    tagline: "way past the character limit you were allocated",
    weights: { verbosity: 0.5, caps: 0.2, burst: 0.3 },
    describe: (f) =>
      `You were given a reasonable amount of space and used all of it, then kept going into memory nobody allocated to you. The post block was sized for a thought; you wrote a thesis into it. Somewhere downstream, something you weren't supposed to be able to touch just got overwritten.`,
  },
  {
    id: "race",
    cwe: "CWE-362",
    name: "Race Condition",
    emoji: "\u{1F3C1}",
    tagline: "posts before the lock is acquired",
    weights: { replies: 0.4, lateNight: 0.3, burst: 0.3 },
    describe: (f) =>
      `Two threads try to read the situation at once — the room, and you — and you win, every time, by being first and fastest and not waiting your turn. Sometimes that's a great reply. Sometimes it's a reply to a post that got deleted four minutes later and now you're the only evidence it ever existed.`,
  },
  {
    id: "npe",
    cwe: "CWE-476",
    name: "Null Pointer Dereference",
    emoji: "\u{1F47B}",
    tagline: "dereferenced a presence that was never actually there",
    weights: { lurk: 0.65, reciprocityGap: 0.35 },
    describe: (f) =>
      `Everyone follows you expecting a post to be at the other end of that pointer eventually. It's not. It was never initialized. The timeline crashes softly, quietly, off-screen, every single time someone checks.`,
  },
  {
    id: "loop",
    cwe: "CWE-835",
    name: "Infinite Loop",
    emoji: "\u{1F501}",
    tagline: "the exit condition was never actually reachable",
    weights: { repetition: 0.6, grudge: 0.4 },
    describe: (f) =>
      `Same bit, same complaint, same three words, over and over, indistinguishable iteration to iteration. Somewhere there's supposed to be a break condition. There isn't. The fans are just going to keep spinning.`,
  },
  {
    id: "uaf",
    cwe: "CWE-416",
    name: "Use-After-Free",
    emoji: "\u{1F480}",
    tagline: "still holding a reference to something that got deallocated",
    weights: { grudge: 0.55, repetition: 0.2, lateNight: 0.25 },
    describe: (f) =>
      `That drama got garbage collected months ago. Everyone else's pointers moved on. Yours didn't — you're still reading from that freed memory at 2am, and every so often you write back to it, which is exactly the kind of thing that corrupts the heap for everybody else too.`,
  },
  {
    id: "offbyone",
    cwe: "CWE-193",
    name: "Off-by-One Error",
    emoji: "\u{1F522}",
    tagline: "almost exactly right, every single time",
    weights: { verbosity: 0.2, hyperbole: 0.2, caps: 0.15, selfRef: 0.15, repetition: 0.15, replies: 0.15 },
    describe: (f) =>
      `Nothing about you spikes. No single signal maxes out — you're just consistently, quietly one index off from whatever the correct behavior was supposed to be. The kind of bug that passes code review three times before someone notices the loop runs one time too many.`,
  },
  {
    id: "hardcoded",
    cwe: "CWE-798",
    name: "Hardcoded Credentials",
    emoji: "\u{1F511}",
    tagline: "the same secret, committed in plaintext, every time",
    weights: { repetition: 0.45, botFollow: 0.3, lurk: 0.25 },
    describe: (f) =>
      `Whatever you're running on, the config never changes. Same voice, same bit, same handful of accounts in your recent-activity graph — nothing rotated, nothing environment-specific. Convenient, until someone reads the repo and finds out exactly how you work every time.`,
  },
  {
    id: "csrf",
    cwe: "CWE-352",
    name: "Cross-Site Request Forgery",
    emoji: "\u{1FA84}",
    tagline: "executes any request a mutual embeds, no confirmation asked",
    weights: { reciprocityHigh: 0.5, quotes: 0.3, replies: 0.2 },
    describe: (f) =>
      `A mutual you trust posts something with a little bit of intent baked into it, and you just... act on it. Follow, quote, pile on, repeat back. No token check, no "did I actually mean to do this," just implicit trust that whoever's asking must be who they say they are.`,
  },
  {
    id: "zeroday",
    cwe: "n/a — unpatched, no advisory filed",
    name: "Zero-Day",
    emoji: "\u{1F480}\u{1F4BB}",
    tagline: "nobody saw it coming, including you",
    weights: { lateNight: 0.5, burst: 0.35, lurk: 0.15 },
    describe: (f) =>
      `Quiet for a stretch, then suddenly, unpredictably, live in production with zero warning — a follow spree, a post at an hour nobody's timeline expected, and it's over before anyone can write a signature for it. No CVE existed for you until right now.`,
  },
  {
    id: "traversal",
    cwe: "CWE-22",
    name: "Path Traversal",
    emoji: "\u{1F9ED}",
    tagline: "../../../ out of whatever directory you were scoped to",
    weights: { customDomain: 0.6, followImbalance: 0.4 },
    describe: (f) =>
      `You were scoped to one corner of this website and you just... left it. Half your follow graph lives somewhere the algorithm never meant to route you to. No sandbox holds — you keep climbing out of whatever directory you were supposed to stay in.`,
  },
  {
    id: "overflow-int",
    cwe: "CWE-190",
    name: "Integer Overflow",
    emoji: "\u{1F4C8}",
    tagline: "wraps around from MAX_INT straight back to catastrophic",
    weights: { hyperbole: 0.6, caps: 0.4 },
    describe: (f) =>
      `Every number you post is the biggest or smallest it's ever been. "Never." "Always." "Everyone." "100%." The counter doesn't increment normally — it just wraps straight past the top of the range and comes out the other side as pure, unsigned hyperbole.`,
  },
  {
    id: "memleak",
    cwe: "CWE-401",
    name: "Memory Leak",
    emoji: "\u{1F6B0}",
    tagline: "allocates and allocates, frees almost nothing",
    weights: { followImbalance: 0.5, grudge: 0.3, repetition: 0.2 },
    describe: (f) =>
      `You keep allocating — follows, grudges, open threads — and the free() call basically never runs. Nothing gets garbage collected. It's not a crash yet. It's just slowly, steadily consuming more of the system than it gives back, forever, until someone restarts the process.`,
  },
  {
    id: "privesc",
    cwe: "CWE-269",
    name: "Privilege Escalation",
    emoji: "\u{1F451}",
    tagline: "granted itself admin on a thread it was a guest in",
    weights: { selfRef: 0.6, caps: 0.2, hyperbole: 0.2 },
    describe: (f) =>
      `You walked into someone else's thread as a regular user and walked out running it. Every conversation quietly re-centers on you within a couple of replies — not maliciously, just structurally, the way a bug always finds the path to more permissions than it was granted.`,
  },
  {
    id: "deser",
    cwe: "CWE-502",
    name: "Insecure Deserialization",
    emoji: "\u{1F4E6}",
    tagline: "unpacks untrusted objects and just... runs them",
    weights: { botFollow: 0.65, reciprocityHigh: 0.3 },
    describe: (f) =>
      `Whatever gets handed to you, you unpack it and take it at face value — no type check, no signature verification. A chunk of your follow graph is generic, unverified, faceless input, deserialized straight into trust with no validation step in between.`,
  },
  {
    id: "xss",
    cwe: "CWE-79",
    name: "Cross-Site Scripting",
    emoji: "\u{1F9EA}",
    tagline: "injects live, unescaped chaos into pages you don't own",
    weights: { replies: 0.5, quotes: 0.3, caps: 0.2 },
    describe: (f) =>
      `You show up in someone else's reply section and execute anyway — unescaped, unsandboxed, running in the context of their thread instead of your own. Half the time it's a great bit. It's still a script nobody there consented to load.`,
  },
];

export function pickVuln(features, did) {
  const n = normalize(features);
  let best = null;
  for (const v of VULNS) {
    let sum = 0,
      wsum = 0;
    for (const k in v.weights) {
      sum += v.weights[k] * n[k];
      wsum += Math.abs(v.weights[k]);
    }
    let score = wsum ? sum / wsum : 0;
    // Small deterministic jitter (same handle -> same result, always) so
    // near-empty or dead-even accounts don't all collapse onto one bug.
    score += ((fnv1a(did + "|" + v.id) % 997) / 997) * 0.04;

    const contributions = Object.keys(v.weights)
      .map((k) => ({ key: k, contribution: v.weights[k] * n[k] }))
      .sort((a, b) => b.contribution - a.contribution);

    if (!best || score > best.score) best = { vuln: v, score, contributions };
  }

  const evidence = best.contributions
    .slice(0, 3)
    .map((c) => EVIDENCE[c.key]?.(features))
    .filter(Boolean);

  return { ...best, evidence };
}

export function severityFor(score) {
  const cvss = Math.round(clamp01(score) * 78 + 15) / 10; // ~1.5 - 9.3
  let label = "Low";
  if (cvss >= 9) label = "Critical";
  else if (cvss >= 7) label = "High";
  else if (cvss >= 4) label = "Medium";
  return { cvss: Math.min(9.8, cvss), label };
}

const PATCH_STATUS = [
  "Unpatched",
  "No fix available",
  "Patch pending upstream review",
  "Wontfix (by design)",
  "Patched — recurs after every deploy",
  "Under active triage",
];
const EXPLOIT_MATURITY = [
  "Proof-of-concept",
  "Weaponized",
  "Actively exploited in the wild",
  "Exploit code publicly available",
  "Theoretical",
  "Functional",
];

export function cveFor(did, vulnId) {
  const h = fnv1a(did + "::" + vulnId);
  const year = 2019 + (h % 8);
  const num = 1000 + (h % 89000);
  return {
    id: `CVE-${year}-${num}`,
    patchStatus: PATCH_STATUS[h % PATCH_STATUS.length],
    exploitMaturity: EXPLOIT_MATURITY[(h >> 3) % EXPLOIT_MATURITY.length],
  };
}
