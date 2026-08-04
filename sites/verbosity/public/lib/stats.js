// verbosity's analysis engine — verbosity.bisks.net
//
// Built for @ashanti.pds.witchcraft.systems: "make a website that lets me see
// how many of my bluesky posts hit exactly the 300 character limit (along
// with other general statistics about whether my posts tend to be long or
// short)". Paginates the public AppView's getAuthorFeed for one handle,
// measures every post's own text in *graphemes* (the unit Bluesky's own
// 300-limit counts in, not UTF-16 code units — an emoji or a flag is one
// grapheme but can be 2-8 UTF-16 units), and reduces that into a length
// distribution. Everything here is plain data in, plain data out — no
// network calls in this file, public/index.html does the fetching.

(function (global) {
  const API = "https://public.api.bsky.app/xrpc/";
  const MAX_PAGES = 20; // 20 * 100 = up to 2000 posts; a safety cap, not a real limit for most accounts
  const CAP = 300;

  async function xrpc(method, params) {
    const qs = new URLSearchParams(params).toString();
    const res = await fetch(API + method + (qs ? "?" + qs : ""), { cache: "no-store" });
    if (!res.ok) {
      let msg = res.statusText;
      try { msg = (await res.json()).message || msg; } catch (_) {}
      throw new Error(msg);
    }
    return res.json();
  }

  // Grapheme count via Intl.Segmenter — the same unit Bluesky's own client
  // uses to enforce the 300 cap, so "exactly 300" here means what it means
  // in the composer. Falls back to a codepoint count (Array.from) on engines
  // without Intl.Segmenter, which undercounts multi-codepoint grapheme
  // clusters (flags, some ZWJ emoji) but still beats raw .length.
  const segmenter =
    typeof Intl !== "undefined" && Intl.Segmenter ? new Intl.Segmenter("en", { granularity: "grapheme" }) : null;
  function graphemeLength(text) {
    if (!text) return 0;
    if (segmenter) return [...segmenter.segment(text)].length;
    return Array.from(text).length;
  }

  function rkeyFromUri(uri) {
    const parts = (uri || "").split("/");
    return parts[parts.length - 1] || "";
  }

  // Pulls one handle's whole authored history (paginated), skipping reposts
  // (someone else's words, boosted rather than written) and anything not
  // actually authored by the resolved DID.
  async function fetchPosts(did, { onStep } = {}) {
    const out = [];
    let cursor;
    for (let page = 0; page < MAX_PAGES; page++) {
      onStep && onStep(`reading feed (page ${page + 1}, ${out.length} posts so far)…`);
      const params = { actor: did, limit: "100" };
      if (cursor) params.cursor = cursor;
      const data = await xrpc("app.bsky.feed.getAuthorFeed", params);
      for (const item of data.feed || []) {
        if (item.reason) continue; // a repost, not their own words
        const post = item.post;
        if (!post || !post.record || post.author?.did !== did) continue;
        const text = post.record.text || "";
        out.push({
          uri: post.uri,
          rkey: rkeyFromUri(post.uri),
          createdAt: post.record.createdAt || post.indexedAt,
          text,
          length: graphemeLength(text),
          isReply: !!post.record.reply,
        });
      }
      cursor = data.cursor;
      if (!cursor || !data.feed || !data.feed.length) break;
    }
    return out;
  }

  const BUCKETS = [
    { label: "0–49", min: 0, max: 49 },
    { label: "50–99", min: 50, max: 99 },
    { label: "100–149", min: 100, max: 149 },
    { label: "150–199", min: 150, max: 199 },
    { label: "200–249", min: 200, max: 249 },
    { label: "250–299", min: 250, max: 299 },
    { label: "300", min: 300, max: 300 },
  ];

  function median(nums) {
    if (!nums.length) return 0;
    const s = [...nums].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  }

  // A short, cheeky verdict off the average length and how often someone
  // maxes out the cap — deliberately impressionistic, not a precise model.
  function verdictFor(avg, exactPct) {
    if (exactPct >= 15) return { label: "Chronic Maximizer", blurb: "you compose to the wall, then stop. the limit isn't a ceiling, it's a target." };
    if (avg >= 220) return { label: "The Sprawler", blurb: "you use the room you're given. most posts read like paragraphs that ran out of patience for line breaks." };
    if (avg >= 130) return { label: "Measured", blurb: "you say what you mean and roughly nothing more. comfortably mid-length, most of the time." };
    if (avg >= 60) return { label: "Clipped", blurb: "short, frequent, to the point. you'd rather post twice than pad one out." };
    return { label: "Haiku Energy", blurb: "your posts are mostly fragments. the limit has never once been a factor in your life." };
  }

  function analyze(posts) {
    const withText = posts.filter((p) => p.length > 0);
    const lengths = withText.map((p) => p.length);
    const total = posts.length;
    const totalWithText = withText.length;

    const exact = withText.filter((p) => p.length === CAP);
    const nearCap = withText.filter((p) => p.length >= CAP - 10 && p.length < CAP);

    const histogram = BUCKETS.map((b) => ({
      ...b,
      count: withText.filter((p) => p.length >= b.min && p.length <= b.max).length,
    }));

    const sum = lengths.reduce((a, b) => a + b, 0);
    const avg = totalWithText ? sum / totalWithText : 0;
    const med = median(lengths);

    const sorted = [...withText].sort((a, b) => b.length - a.length);
    const longest = sorted[0] || null;
    const shortest = sorted.length ? sorted[sorted.length - 1] : null;

    const shortCount = withText.filter((p) => p.length <= 100).length;
    const longCount = withText.filter((p) => p.length >= 250).length;

    return {
      total,
      totalWithText,
      textlessCount: total - totalWithText,
      exactCount: exact.length,
      exactPct: totalWithText ? (exact.length / totalWithText) * 100 : 0,
      nearCapCount: nearCap.length,
      nearCapPct: totalWithText ? (nearCap.length / totalWithText) * 100 : 0,
      avg,
      median: med,
      histogram,
      longest,
      shortest,
      shortPct: totalWithText ? (shortCount / totalWithText) * 100 : 0,
      longPct: totalWithText ? (longCount / totalWithText) * 100 : 0,
      verdict: verdictFor(avg, totalWithText ? (exact.length / totalWithText) * 100 : 0),
    };
  }

  global.VerbosityStats = { fetchPosts, analyze, graphemeLength, BUCKETS, CAP };
})(window);
