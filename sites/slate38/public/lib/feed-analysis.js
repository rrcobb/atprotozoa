// Real-feed analysis engine for slate38. Pulls each candidate's own recent
// posts from the public AppView (one getAuthorFeed call, no auth, no
// pagination — this is a vibe-read sample of recent activity for a hype
// pitch, not a request for someone's whole history, so a single 100-post
// page is the right scope; see notes on bulk reads for when a full
// getRepo download would actually be warranted instead) and turns real
// numbers into a "hype pitch": a headline, a few campaign planks, and a
// Hype Index score used to rank the whole ticket. No hand-written jokes
// about any specific account — every line here is a template filled in
// from that account's own data, so the ranking isn't rigged.
(function (global) {
  const API = "https://public.api.bsky.app/xrpc/";

  const STOPWORDS = new Set([
    "the", "a", "an", "and", "or", "but", "of", "to", "in", "on", "for", "is",
    "are", "was", "were", "be", "been", "it", "this", "that", "with", "as",
    "at", "by", "from", "i", "you", "he", "she", "they", "we", "my", "your",
    "his", "her", "their", "our", "not", "no", "so", "if", "just", "like",
    "its", "it's", "im", "i'm", "have", "has", "had", "do", "does", "did",
    "will", "would", "can", "could", "about", "what", "when", "who", "how",
    "why", "there", "here", "out", "up", "down", "over", "also", "than",
    "then", "them", "us", "me", "one", "get", "got", "all", "some", "more",
    "most", "very", "really", "still", "even", "only", "into", "you're",
    "don't", "yeah", "gonna", "going", "know", "think", "want", "need",
  ]);

  const EMOJI_RE = /\p{Extended_Pictographic}/gu;

  async function xrpc(method, params) {
    const qs = new URLSearchParams(params).toString();
    const res = await fetch(API + method + (qs ? "?" + qs : ""));
    if (!res.ok) throw new Error(method + " " + res.status);
    return res.json();
  }

  function tokenize(text) {
    return (text || "")
      .toLowerCase()
      .replace(/https?:\/\/\S+/g, " ")
      .replace(/@[a-z0-9.\-]+/g, " ")
      .replace(/[^a-z0-9#'\s]/g, " ")
      .split(/\s+/)
      .filter(Boolean);
  }

  async function fetchOwnFeed(actor, limit) {
    const data = await xrpc("app.bsky.feed.getAuthorFeed", { actor, limit: String(limit || 100) });
    // Reposts show up in the feed as someone else's post wrapped with a
    // `reason` — filter to items this account actually authored themselves.
    return (data.feed || []).filter((it) => !it.reason);
  }

  function analyzeItems(items) {
    const n = items.length;
    if (!n) return null;

    let likes = 0, reposts = 0, replies = 0, quotes = 0;
    let replyPostCount = 0, imageCount = 0, quoteEmbedCount = 0, exclaim = 0, question = 0;
    let earliest = Infinity, latest = -Infinity, totalLen = 0;
    const wordFreq = new Map();
    const tagFreq = new Map();
    const emojiFreq = new Map();

    items.forEach((it) => {
      const post = it.post;
      const rec = post.record || {};
      likes += post.likeCount || 0;
      reposts += post.repostCount || 0;
      replies += post.replyCount || 0;
      quotes += post.quoteCount || 0;

      const t = Date.parse(rec.createdAt || post.indexedAt || "");
      if (!Number.isNaN(t)) { earliest = Math.min(earliest, t); latest = Math.max(latest, t); }

      const text = rec.text || "";
      totalLen += text.length;
      if (text.includes("!")) exclaim++;
      if (text.includes("?")) question++;
      if (rec.reply) replyPostCount++;

      const embed = post.embed || rec.embed;
      if (embed) {
        const type = embed.$type || "";
        const mediaType = (embed.media && embed.media.$type) || "";
        if (type.includes("images") || mediaType.includes("images")) imageCount++;
        if (type.includes("record")) quoteEmbedCount++;
      }

      tokenize(text).forEach((w) => {
        if (w.startsWith("#") && w.length > 1) {
          tagFreq.set(w, (tagFreq.get(w) || 0) + 1);
          return;
        }
        if (w.length < 3 || STOPWORDS.has(w)) return;
        wordFreq.set(w, (wordFreq.get(w) || 0) + 1);
      });

      const emojis = text.match(EMOJI_RE);
      if (emojis) emojis.forEach((e) => emojiFreq.set(e, (emojiFreq.get(e) || 0) + 1));
    });

    const days = Math.max(1, (latest - earliest) / 86400000);
    const postsPerDay = n / days;
    const avgLikes = likes / n, avgReposts = reposts / n, avgReplies = replies / n, avgQuotes = quotes / n;
    const engagement = (likes + reposts * 2 + replies * 1.5 + quotes * 2) / n;
    const replyRatio = replyPostCount / n;
    const imageRatio = imageCount / n;
    const quoteRatio = quoteEmbedCount / n;

    const topWords = [...wordFreq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([w]) => w);
    const topTags = [...tagFreq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([w]) => w);
    const topEmojiEntry = [...emojiFreq.entries()].sort((a, b) => b[1] - a[1])[0];

    const hypeScore = Math.round(engagement * 8 + postsPerDay * 6 + (topTags.length ? 15 : 0));

    return {
      n, likes, reposts, replies, quotes,
      avgLikes, avgReposts, avgReplies, avgQuotes,
      engagement, postsPerDay, replyRatio, imageRatio, quoteRatio,
      avgLen: totalLen / n,
      exclaimRatio: exclaim / n, questionRatio: question / n,
      topWords, topTags, topEmoji: topEmojiEntry ? topEmojiEntry[0] : null,
      hypeScore,
    };
  }

  function fmt1(x) {
    return (Math.round((x || 0) * 10) / 10).toFixed(1);
  }

  function buildPitch(stats) {
    if (!stats) {
      return {
        headline: "no public post history to run — a blank slate, and therefore unimpeachable",
        planks: [
          "Zero posts made it into the analysis. Nothing on record to hold against them.",
          "A candidate untouched by data. Refreshing, honestly.",
        ],
        score: 1,
        stats: null,
      };
    }

    const planks = [];

    if (stats.topWords[0]) {
      planks.push(
        `On-message about "${stats.topWords[0]}"${stats.topWords[1] ? ` and "${stats.topWords[1]}"` : ""} — ` +
        `it shows up across the ${stats.n} posts analyzed, ${fmt1(stats.postsPerDay)}/day.`
      );
    } else {
      planks.push(`Posts ${fmt1(stats.postsPerDay)} times a day across the sample analyzed. Message discipline: not required.`);
    }

    if (stats.topTags[0]) {
      planks.push(`Campaigning under ${stats.topTags[0]} whether that was the plan or not.`);
    } else if (stats.imageRatio > 0.25) {
      planks.push(`Runs a visual campaign — ${Math.round(stats.imageRatio * 100)}% of the sample shipped with a picture.`);
    } else if (stats.replyRatio > 0.5) {
      planks.push(`Governs from the replies — ${Math.round(stats.replyRatio * 100)}% of this sample wasn't even a top-level post.`);
    } else {
      planks.push(`Averages ${fmt1(stats.avgReplies)} replies and ${fmt1(stats.avgReposts)} reposts a post. A mandate, arguably.`);
    }

    if (stats.avgLikes >= 15) {
      planks.push(`Pulls ${fmt1(stats.avgLikes)} likes a post on average. The people have spoken; the algorithm agrees.`);
    } else if (stats.quoteRatio > 0.15) {
      planks.push(`Quote-posts ${Math.round(stats.quoteRatio * 100)}% of the time — an opinion held loudly, about someone else's opinion.`);
    } else if (stats.topEmoji) {
      planks.push(`Communicates in ${stats.topEmoji} when words won't do. A platform of few, well-chosen symbols.`);
    } else {
      planks.push(`Keeps posts to about ${Math.round(stats.avgLen)} characters apiece. Concision as a civic virtue.`);
    }

    return {
      headline: `${stats.n} posts analyzed · Hype Index ${stats.hypeScore}`,
      planks,
      score: stats.hypeScore,
      stats,
    };
  }

  async function analyzeHandle(handle) {
    try {
      const items = await fetchOwnFeed(handle, 100);
      return buildPitch(analyzeItems(items));
    } catch (_) {
      return buildPitch(null);
    }
  }

  // Runs `fn` over `items` with at most `limit` in flight at once — 38
  // individual getAuthorFeed calls fired all at once is rude to the public
  // AppView; a small worker pool keeps this polite without falling back to
  // one-at-a-time pagination.
  async function mapWithConcurrency(items, limit, fn, onProgress) {
    const results = new Array(items.length);
    let idx = 0, done = 0;
    async function worker() {
      while (idx < items.length) {
        const i = idx++;
        try { results[i] = await fn(items[i], i); } catch (_) { results[i] = null; }
        done++;
        if (onProgress) onProgress(done, items.length);
      }
    }
    const workers = [];
    for (let w = 0; w < Math.min(limit, items.length); w++) workers.push(worker());
    await Promise.all(workers);
    return results;
  }

  global.SlateAnalysis = { analyzeHandle, mapWithConcurrency };
})(window);
