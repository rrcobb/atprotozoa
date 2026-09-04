// Real-feed analysis engine for slate38. Pulls each candidate's own recent
// posts from the public AppView (one getAuthorFeed call, no auth, no
// pagination — this is a vibe-read sample of recent activity for a hype
// pitch, not a request for someone's whole history, so a single 100-post
// page is the right scope; see notes on bulk reads for when a full
// getRepo download would actually be warranted instead) and turns it into
// a "hype pitch": a headline, a Hype Index score, and campaign planks.
//
// The Hype Index score is still computed live, right here, from real
// engagement numbers — unrigged (the slate's #1 slot is pinned separately,
// in index.html — see the comment there).
//
// The planks (the actual "tea") are a different story as of 2026-09-04: per
// @antiali.as — "this is just another statistics run; i'm looking for
// *your* read, be personal and excellent" — sorting posts by an engagement
// formula and quoting the extremes was still statistics wearing a tea
// costume. So buildthis actually read every candidate's feed by hand ahead
// of time and wrote a real take for each one; see my-read.js. buildPitch()
// below uses that hand-written take when one exists and only falls back to
// the algorithmic highlight/low-point selection (still real quotes, still
// real numbers, just formula-picked instead of person-picked) for a handle
// nobody's actually read yet.
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

  // Turns a post's at:// uri + author handle into a real bsky.app permalink,
  // so a "highlight"/"low point" can point back at the actual post instead
  // of just asserting a quote happened.
  function permalinkFor(post) {
    const handle = post.author && post.author.handle;
    const uri = post.uri || "";
    const rkey = uri.split("/").pop();
    if (!handle || !rkey) return null;
    return "https://bsky.app/profile/" + handle + "/post/" + rkey;
  }

  function quoteSnippet(text, max) {
    const clean = (text || "").replace(/\s+/g, " ").trim();
    if (!clean) return null;
    return clean.length > (max || 140) ? clean.slice(0, (max || 140) - 1).trimEnd() + "…" : clean;
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
    // Every post's own engagement, kept around so we can go back and read
    // the actual best/worst-performing post's text — the "tea" — instead of
    // only reporting aggregate numbers.
    const scored = [];

    items.forEach((it) => {
      const post = it.post;
      const rec = post.record || {};
      const postLikes = post.likeCount || 0;
      const postReposts = post.repostCount || 0;
      const postReplies = post.replyCount || 0;
      const postQuotes = post.quoteCount || 0;
      likes += postLikes;
      reposts += postReposts;
      replies += postReplies;
      quotes += postQuotes;

      const t = Date.parse(rec.createdAt || post.indexedAt || "");
      if (!Number.isNaN(t)) { earliest = Math.min(earliest, t); latest = Math.max(latest, t); }

      const text = rec.text || "";
      totalLen += text.length;
      if (text.includes("!")) exclaim++;
      if (text.includes("?")) question++;
      if (rec.reply) replyPostCount++;

      const embed = post.embed || rec.embed;
      let hasImage = false;
      if (embed) {
        const type = embed.$type || "";
        const mediaType = (embed.media && embed.media.$type) || "";
        hasImage = type.includes("images") || mediaType.includes("images");
        if (hasImage) imageCount++;
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

      scored.push({
        text, hasImage,
        likes: postLikes, reposts: postReposts, replies: postReplies, quotes: postQuotes,
        engagement: postLikes + postReposts * 2 + postReplies * 1.5 + postQuotes * 2,
        permalink: permalinkFor(post),
      });
    });

    // Sort once by how each post actually landed — the top of this list is
    // the highlight, the bottom is the low point. Prefer posts with real
    // text for both ends (a bare repost-bait post makes a worse pull-quote
    // than a real one, even if it scored higher/lower).
    const byEngagement = scored.slice().sort((a, b) => b.engagement - a.engagement);
    const withText = byEngagement.filter((s) => quoteSnippet(s.text));
    const highlightPost = withText[0] || byEngagement[0] || null;
    let lowPointPost = null;
    if (withText.length > 1) {
      lowPointPost = withText[withText.length - 1];
    } else if (byEngagement.length > 1) {
      lowPointPost = byEngagement[byEngagement.length - 1];
    }
    if (lowPointPost === highlightPost) lowPointPost = null;

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
      highlightPost, lowPointPost,
      hypeScore,
    };
  }

  function fmt1(x) {
    return (Math.round((x || 0) * 10) / 10).toFixed(1);
  }

  // The actual tea: quote the account's best-performing post from the
  // sample, with the real numbers it pulled — not a characterization of
  // "high engagement," the post itself.
  function highlightLine(post) {
    const q = quoteSnippet(post.text, 160);
    if (q) {
      return `Best moment in the sample: "${q}" — ${post.likes} like${post.likes === 1 ? "" : "s"}, ${post.reposts} repost${post.reposts === 1 ? "" : "s"}. Peak form.`;
    }
    if (post.hasImage) {
      return `Best moment in the sample was a picture, no caption needed — ${post.likes} like${post.likes === 1 ? "" : "s"}, ${post.reposts} repost${post.reposts === 1 ? "" : "s"}.`;
    }
    return `Best moment in the sample pulled ${post.likes} like${post.likes === 1 ? "" : "s"} and ${post.reposts} repost${post.reposts === 1 ? "" : "s"} on bare text alone.`;
  }

  // The flip side, read just as honestly — a real low point, not a
  // generated "weakness" template.
  function lowPointLine(post) {
    const q = quoteSnippet(post.text, 160);
    if (q) {
      return `Quietest post in the sample: "${q}" — ${post.likes} like${post.likes === 1 ? "" : "s"}, ${post.reposts} repost${post.reposts === 1 ? "" : "s"}. Even a campaign has an off day.`;
    }
    return `Quietest post in the sample barely moved: ${post.likes} like${post.likes === 1 ? "" : "s"}, ${post.reposts} repost${post.reposts === 1 ? "" : "s"}. Nobody bats 1.000.`;
  }

  // Grounding stats, used when there's no distinct highlight/low-point post
  // to read from (e.g. a one-post sample) and as a third data point to keep
  // the pitch honest rather than pure vibes.
  function groundingLineA(stats) {
    if (stats.topWords[0]) {
      return `On-message about "${stats.topWords[0]}"${stats.topWords[1] ? ` and "${stats.topWords[1]}"` : ""} — it shows up across the ${stats.n} posts read, ${fmt1(stats.postsPerDay)}/day.`;
    }
    return `Posts ${fmt1(stats.postsPerDay)} times a day across the sample read. Message discipline: not required.`;
  }

  function groundingLineB(stats) {
    if (stats.topTags[0]) return `Campaigning under ${stats.topTags[0]} whether that was the plan or not.`;
    if (stats.imageRatio > 0.25) return `Runs a visual campaign — ${Math.round(stats.imageRatio * 100)}% of the sample shipped with a picture.`;
    if (stats.replyRatio > 0.5) return `Governs from the replies — ${Math.round(stats.replyRatio * 100)}% of this sample wasn't even a top-level post.`;
    if (stats.avgLikes >= 15) return `Pulls ${fmt1(stats.avgLikes)} likes a post on average. The people have spoken; the algorithm agrees.`;
    if (stats.topEmoji) return `Communicates in ${stats.topEmoji} when words won't do. A platform of few, well-chosen symbols.`;
    return `Keeps posts to about ${Math.round(stats.avgLen)} characters apiece. Concision as a civic virtue.`;
  }

  // My actual take, hand-written after reading the feed myself — see
  // my-read.js. Takes precedence over the algorithmic highlight/low-point
  // selection below whenever one exists; the score stays live either way.
  function myRead(handle) {
    const table = global.SLATE_MY_READ;
    return table ? table[handle.toLowerCase()] : null;
  }

  function buildPitch(stats, handle) {
    const mine = handle ? myRead(handle) : null;

    if (!stats) {
      if (mine) {
        return { headline: `${mine.tagline} · Hype Index 1`, planks: mine.planks, score: 1, stats: null };
      }
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

    // Lead with a real read of the feed. If I've actually sat down and read
    // this handle myself (my-read.js), that take wins — it's specific and
    // personal instead of an engagement formula's pick of "best" and
    // "worst." Otherwise fall back to the algorithmic highlight/low-point
    // read below, which is still a real quote, just chosen by a formula
    // instead of a person.
    const planks = mine
      ? mine.planks
      : [
          highlightLine(stats.highlightPost),
          stats.lowPointPost ? lowPointLine(stats.lowPointPost) : groundingLineA(stats),
          groundingLineB(stats),
        ];

    return {
      headline: mine ? `${mine.tagline} · Hype Index ${stats.hypeScore}` : `${stats.n} posts read · Hype Index ${stats.hypeScore}`,
      planks,
      score: stats.hypeScore,
      stats,
    };
  }

  async function analyzeHandle(handle) {
    try {
      const items = await fetchOwnFeed(handle, 100);
      return buildPitch(analyzeItems(items), handle);
    } catch (_) {
      return buildPitch(null, handle);
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
