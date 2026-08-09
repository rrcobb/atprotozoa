"use strict";

// goodposts.js — the filter goodsky is built around.
//
// "Only show me the good posts" isn't a solved problem and this doesn't
// pretend to solve it with AI magic — there's no model in the loop, no
// server, no per-user training. It's a small, fixed set of heuristics run
// entirely in the browser against fields the AppView already hands back on
// every post (text, facets, embed, engagement counts). Transparent on
// purpose: every signal below is legible, the whole function is ~120 lines,
// and AboutView spells out exactly what it does and doesn't catch. The
// "breakthrough" isn't a clever algorithm — it's making the filter honest
// and adjustable instead of a black box, so it's obvious what you're
// trading away by turning it on.
//
// scorePost(item) -> { score, good, reasons }
//   score:   -100..100ish, higher is "better". Starts at a neutral baseline
//            and signals push it up or down.
//   good:    score >= the active threshold (see THRESHOLDS below).
//   reasons: short strings explaining what moved the score, worst-first —
//            surfaced inline via the goodbar's "show hidden" toggle (see
//            wrapHidden()/mountFilterBar() in app.js), so filtering is
//            inspectable on your own feed, not a mystery.
//
// Deliberately does NOT filter on: viewpoint, topic, sensitivity labels,
// verification status, or follower count. Filtering by *opinion* is a
// different (and much more fraught) product than filtering by *quality
// signal* — see AboutView for the line goodsky draws.

export const THRESHOLDS = {
  lenient: 20, // only the clearest spam/bait gets cut
  balanced: 40, // default
  strict: 60, // also cuts low-effort one-liners and borderline bait
};

const BAIT_PHRASES = [
  /\bfollow\s*(for|4)\s*follow\b/i,
  /\blike\s*(and|&)\s*(rt|repost|share)\b/i,
  /\brt\s+this\b/i,
  /\btag\s+someone\s+who\b/i,
  /\bdrop\s+your\s+(handle|link|profile)\b/i,
  /\bcomment\s+your\b/i,
  /\bwho'?s?\s+(still\s+)?awake\b/i,
  /\bmutuals?\s+only\b/i,
  /\bboost\s+for\s+(visibility|reach)\b/i,
  /\bunpopular\s+opinion\s*:?\s*$/i, // the bare bait framing with no actual take attached
  /\bnobody\s*:\s*$/i, // "nobody:" copypasta format with nothing after it
  /\byou\s+won'?t\s+believe\b/i,
  /\bclick\s+here\b/i,
  /\bswipe\s+up\b/i,
  /\bgiveaway\b.*\b(follow|like|rt|retweet|repost)\b/i,
];

const SPAM_PHRASES = [
  /\bfree\s+(crypto|nft|airdrop)\b/i,
  /\b(dm|message)\s+me\s+for\b/i,
  /\bonlyfans\b/i,
  /\bcheck\s+my\s+bio\b/i,
  /\bmake\s+\$?\d[\d,]*\s*(a|per)\s*(day|week)\b/i,
  /\bwork\s+from\s+home\b.*\b\$/i,
];

function stripUrls(text) {
  return text.replace(/https?:\/\/\S+/gi, "").trim();
}

function letterCounts(text) {
  const letters = text.replace(/[^a-zA-Z]/g, "");
  const upper = letters.replace(/[^A-Z]/g, "");
  return { letters: letters.length, upper: upper.length };
}

// item is a feed entry: { post, reply?, reason? } — post is an
// app.bsky.feed.defs#postView. Works directly on a bare postView too (author
// feeds / search results don't wrap in a feed-item envelope). `threshold`
// defaults to the "balanced" preset (see THRESHOLDS).
export function scorePost(item, threshold) {
  const post = item.post || item;
  const record = post.record || {};
  const text = record.text || "";
  const bareText = stripUrls(text);
  const words = bareText.split(/\s+/).filter(Boolean);
  const embed = post.embed;
  const hasMedia = !!embed && embed.$type !== "app.bsky.embed.record#view";
  const isReply = !!record.reply;
  const isQuote = embed?.$type === "app.bsky.embed.record#view" || embed?.$type === "app.bsky.embed.recordWithMedia#view";

  let score = 50;
  const reasons = [];

  // --- bait / spam phrase matches — the clearest, highest-confidence signal
  const baitHit = BAIT_PHRASES.some((re) => re.test(text));
  if (baitHit) {
    score -= 45;
    reasons.push("reads like engagement bait");
  }
  const spamHit = SPAM_PHRASES.some((re) => re.test(text));
  if (spamHit) {
    score -= 50;
    reasons.push("matches a spam pattern");
  }

  // --- shouting: mostly-uppercase text, long enough that it isn't just an
  // acronym or initialism
  const { letters, upper } = letterCounts(bareText);
  if (letters >= 12 && upper / letters > 0.7) {
    score -= 20;
    reasons.push("mostly capital letters");
  }

  // --- hashtag spam
  const tagCount = (record.facets || []).filter((f) =>
    (f.features || []).some((feat) => feat.$type === "app.bsky.richtext.facet#tag")
  ).length;
  if (tagCount > 4) {
    score -= 15;
    reasons.push(`${tagCount} hashtags`);
  }

  // --- ratio / dogpile: reply count far outstrips likes on a post with real
  // volume — a decent proxy for "this started a fight," not for "this is
  // interesting." Skip when there's barely any engagement at all — noise.
  const likes = post.likeCount || 0;
  const replies = post.replyCount || 0;
  if (replies >= 20 && replies > likes * 3) {
    score -= 15;
    reasons.push("ratio'd — mostly replies, not likes");
  }

  // --- link-only posts with nothing but the URL and a bare external embed:
  // common shape for marketing/spam accounts. A real article share almost
  // always has a line of commentary or the embed carries its own
  // title/description, so only penalize the truly bare case.
  if (!bareText && embed?.$type === "app.bsky.embed.external#view" && !embed.external?.description) {
    score -= 10;
    reasons.push("bare link, no commentary");
  }

  // --- substance: a short, medialess, non-reply, non-quote post with almost
  // no text reads as low-effort filler. Modest penalty — plenty of good
  // one-liners exist, this just nudges them below the "strict" bar, not
  // "balanced".
  if (!hasMedia && !isReply && !isQuote && words.length > 0 && words.length < 3 && bareText.length < 12) {
    score -= 10;
    reasons.push("very short, no context");
  }

  // --- accessibility: alt text on every image is a real, if small, quality
  // signal — someone took the extra step.
  if (embed?.$type === "app.bsky.embed.images#view" && embed.images?.length) {
    const withAlt = embed.images.filter((im) => (im.alt || "").trim().length > 0).length;
    if (withAlt === embed.images.length) {
      score += 6;
      reasons.push("image alt text present");
    }
  }

  // --- a genuine reply in a real thread, or a quote with actual added
  // commentary, tends to be more substantive than a cold broadcast post.
  if (isReply && bareText.length >= 12) score += 4;
  if (isQuote && bareText.length >= 12) {
    score += 6;
    reasons.push("quote with real commentary");
  }

  // reasons is already worst-first: bait/spam pushed in first, above.
  const good = score >= (threshold ?? THRESHOLDS.balanced);
  return { score, reasons, good };
}

// --- settings: on/off + threshold, persisted so it holds across visits ---

const LS_ENABLED = "goodsky:filter-enabled";
const LS_THRESHOLD = "goodsky:filter-threshold";

export function isGoodPostsEnabled() {
  const v = localStorage.getItem(LS_ENABLED);
  return v === null ? true : v === "1"; // on by default — that's the whole point of the site
}
export function setGoodPostsEnabled(on) {
  localStorage.setItem(LS_ENABLED, on ? "1" : "0");
}
export function getThreshold() {
  const v = Number(localStorage.getItem(LS_THRESHOLD));
  return Number.isFinite(v) && v ? v : THRESHOLDS.balanced;
}
export function setThreshold(n) {
  localStorage.setItem(LS_THRESHOLD, String(n));
}

// Scores a feed array (of raw feed items, or bare postViews) against the
// visitor's current settings and returns every item annotated, in original
// order — nothing is dropped here. Returns { scored, hiddenCount }, where
// each scored entry is { item, score, reasons, good, visible }. `visible` is
// what callers should actually gate rendering on: it's `true` for every item
// when the filter is off (score/reasons are null — never computed, since
// nothing needs them), and equal to `good` when the filter is on. Keeping
// hidden items in the list (instead of dropping them) is what lets the UI
// render them inline behind a "show hidden" toggle — see mountFilterBar/
// wrapHidden in app.js — so the filter stays inspectable rather than a
// silent black box.
export function applyFilter(items) {
  const enabled = isGoodPostsEnabled();
  if (!enabled) {
    return {
      scored: items.map((item) => ({ item, score: null, reasons: [], good: true, visible: true })),
      hiddenCount: 0,
    };
  }
  const threshold = getThreshold();
  let hiddenCount = 0;
  const scored = items.map((item) => {
    const { score, reasons, good } = scorePost(item, threshold);
    if (!good) hiddenCount++;
    return { item, score, reasons, good, visible: good };
  });
  return { scored, hiddenCount };
}
