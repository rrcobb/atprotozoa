// ngmi-analysis.js — ngmi.bisks.net's analysis engine.
//
// Takes every app.bsky.feed.post record pulled out of someone's whole repo
// CAR (see lib/car.js's fetchRepoRecordsWithKeys) and a few profile stats,
// and runs a set of word-list / timing heuristics over them — no LLM, just
// public post text and timestamps read back out, same spirit as
// sites/beefcheck's lib/analysis.js. Each signal that fires cites the actual
// posts that triggered it (quoted text + a link back to the post), so the
// verdict is receipts, not vibes.
//
// Input shape (see analyze below):
//   { handle, records: [{uri, value}], profile: {followersCount, followsCount, postsCount}, now }
// where `value` is a raw app.bsky.feed.post record body and `uri` is
// at://<did>/app.bsky.feed.post/<rkey>.

(function (global) {
  const GRIFT_PHRASES = [
    "wagmi", "ngmi", "gm frens", "gm fam", "wen moon", "to the moon", "🚀🚀",
    "not financial advice", "nfa", "airdrop", "presale", "whitelist spot",
    "diamond hands", "paper hands", "rug pull", "ape in", "few understand",
    "bullish", "bearish", "hopium", "cope and seethe", "wen lambo", "gm ☀️",
  ];
  const DOOMER_PHRASES = [
    "it's so over", "its so over", "everything is over", "nothing matters",
    "i give up", "why do i even", "i'm cooked", "im cooked", "we're cooked",
    "were cooked", "done with this app", "deleting this app",
    "quitting bluesky", "quitting this app", "this is my last post",
    "no point anymore", "what's the point", "whats the point",
  ];
  const BUILD_PHRASES = [
    "shipped", "just launched", "just deployed", "built this", "i built",
    "open sourced", "open-sourced", "pushed to main", "fixed the bug",
    "wrote a blog post", "learned so much", "finally works", "went live",
  ];

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function truncate(s, max) {
    s = (s || "").replace(/\s+/g, " ").trim();
    if (s.length <= max) return s;
    return s.slice(0, max - 1).trimEnd() + "…";
  }

  function rkeyFromUri(uri) {
    return (uri || "").split("/").pop();
  }

  function postUrlFor(handle, rkey) {
    return `https://bsky.app/profile/${handle}/post/${rkey}`;
  }

  function hourUTC(iso) {
    const t = Date.parse(iso);
    if (isNaN(t)) return null;
    return new Date(t).getUTCHours();
  }

  function daysAgo(iso, now) {
    const t = Date.parse(iso);
    if (isNaN(t)) return null;
    return (Date.parse(now) - t) / 86400000;
  }

  function isMostlyUppercase(text) {
    const letters = (text.match(/[a-zA-Z]/g) || []);
    if (letters.length < 8) return false;
    const upper = letters.filter((c) => c === c.toUpperCase() && c !== c.toLowerCase());
    return upper.length / letters.length >= 0.6;
  }

  function findPhrase(lowerText, phrases) {
    for (const p of phrases) if (lowerText.includes(p)) return p;
    return null;
  }

  // Normalizes raw car.js records into the shape the rest of this file wants,
  // sorted oldest-first (rkeys are TIDs, which sort lexically = chronologically,
  // but createdAt is what the record actually claims, so sort by that instead
  // in case a client backdated something).
  function normalizePosts(handle, records) {
    const out = [];
    for (const { uri, value } of records) {
      if (!value || value.$type !== "app.bsky.feed.post") continue;
      const rkey = rkeyFromUri(uri);
      const createdAt = value.createdAt;
      if (!rkey || !createdAt || isNaN(Date.parse(createdAt))) continue;
      out.push({
        rkey,
        text: value.text || "",
        createdAt,
        isReply: !!(value.reply && value.reply.parent),
        url: postUrlFor(handle, rkey),
      });
    }
    out.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
    return out;
  }

  function citePosts(posts, max) {
    return posts.slice(0, max).map((p) => ({ text: truncate(p.text, 140), url: p.url, createdAt: p.createdAt }));
  }

  function verdictFor(score) {
    if (score >= 71) return { label: "certified ngmi", blurb: "the receipts are not looking good, chief." };
    if (score >= 46) return { label: "it's giving ngmi", blurb: "some real signal here, not just noise." };
    if (score >= 21) return { label: "probably fine", blurb: "a few flags, nothing damning — could go either way." };
    return { label: "wagmi", blurb: "clean read. no strong ngmi signal found." };
  }

  function analyze(input) {
    const handle = input.handle;
    const now = input.now || new Date().toISOString();
    const profile = input.profile || {};
    const posts = normalizePosts(handle, input.records || []);

    if (posts.length === 0) {
      return {
        score: 0,
        noData: true,
        verdict: { label: "no data", blurb: "couldn't find any posts to read — repo's empty, or every post's been deleted." },
        totals: { posts: 0, replies: 0 },
        evidence: [],
      };
    }

    let score = 0;
    const evidence = [];

    const oldest = posts[0], newest = posts[posts.length - 1];
    const spanDays = Math.max(1, daysAgo(oldest.createdAt, now) - daysAgo(newest.createdAt, now));
    const replies = posts.filter((p) => p.isReply);
    const original = posts.filter((p) => !p.isReply);

    // Signal 1: grift lexicon.
    const griftHits = [];
    for (const p of posts) {
      const hit = findPhrase(p.text.toLowerCase(), GRIFT_PHRASES);
      if (hit) griftHits.push(p);
    }
    if (griftHits.length >= 3) {
      score += 20;
      evidence.push({ icon: "🪙", weight: 20, label: "grift-coded vocabulary", detail: `${griftHits.length} posts lean on crypto-hustle language ("wagmi", "few understand", "not financial advice", etc.) — the kind of talk that ages badly.`, posts: citePosts(griftHits, 3) });
    } else if (griftHits.length >= 1) {
      score += 8;
      evidence.push({ icon: "🪙", weight: 8, label: "a little grift-coded", detail: `at least one post leans on crypto-hustle vocabulary.`, posts: citePosts(griftHits, 2) });
    }

    // Signal 2: doomer / burnout language.
    const doomHits = [];
    for (const p of posts) {
      const hit = findPhrase(p.text.toLowerCase(), DOOMER_PHRASES);
      if (hit) doomHits.push(p);
    }
    if (doomHits.length) {
      const weight = Math.min(35, 25 + (doomHits.length - 1) * 5);
      score += weight;
      evidence.push({ icon: "😩", weight, label: "doomer language on record", detail: `${doomHits.length} post${doomHits.length === 1 ? "" : "s"} read as burnout or giving-up talk, in their own words.`, posts: citePosts(doomHits, 3) });
    }

    // Signal 3: reply-guy ratio — mostly replies, rarely an original thought.
    if (posts.length >= 15) {
      const replyRatio = replies.length / posts.length;
      if (replyRatio >= 0.85) {
        score += 15;
        evidence.push({ icon: "↩️", weight: 15, label: "reply-guy energy", detail: `${Math.round(replyRatio * 100)}% of ${posts.length} posts are replies — barely any original thoughts of their own.`, posts: citePosts(replies.slice(-3), 3) });
      } else if (replyRatio <= 0.3) {
        score -= 10;
        evidence.push({ icon: "✍️", weight: -10, label: "mostly original posts", detail: `only ${Math.round(replyRatio * 100)}% of ${posts.length} posts are replies — this is someone posting their own thoughts, not just reply-guying.` });
      }
    }

    // Signal 4: late-night posting cluster (UTC hour, approximate — timezone unknown).
    if (posts.length >= 20) {
      const lateNight = posts.filter((p) => {
        const h = hourUTC(p.createdAt);
        return h !== null && h >= 2 && h < 5;
      });
      const ratio = lateNight.length / posts.length;
      if (ratio >= 0.25) {
        score += 15;
        evidence.push({ icon: "🌙", weight: 15, label: "unhinged 3am posting", detail: `${Math.round(ratio * 100)}% of posts land 2–5am UTC. (rough read — timezone unknown, but that's a real cluster.)`, posts: citePosts(lateNight, 3) });
      }
    }

    // Signal 5: went dark — used to post regularly, then just... stopped.
    const lastPostDaysAgo = daysAgo(newest.createdAt, now);
    if (posts.length >= 10 && spanDays >= 30 && lastPostDaysAgo !== null && lastPostDaysAgo >= 90) {
      score += 20;
      evidence.push({ icon: "👻", weight: 20, label: "went dark", detail: `posted regularly for ${Math.round(spanDays)} days, then nothing for ${Math.round(lastPostDaysAgo)} days since their last post.`, posts: citePosts([newest], 1) });
    } else if (lastPostDaysAgo !== null && lastPostDaysAgo <= 7 && posts.length >= 10) {
      score -= 10;
      evidence.push({ icon: "🟢", weight: -10, label: "still actively posting", detail: `last post was ${Math.round(lastPostDaysAgo)} day${Math.round(lastPostDaysAgo) === 1 ? "" : "s"} ago — this account is still showing up.` });
    }

    // Signal 6: all-caps / spam energy.
    if (posts.length >= 20) {
      const shouty = posts.filter((p) => isMostlyUppercase(p.text) || /!{3,}/.test(p.text));
      const ratio = shouty.length / posts.length;
      if (ratio >= 0.1) {
        score += 10;
        evidence.push({ icon: "📢", weight: 10, label: "shouting into the void", detail: `${shouty.length} posts (${Math.round(ratio * 100)}%) are mostly-caps or triple-exclamation-point energy.`, posts: citePosts(shouty, 3) });
      }
    }

    // Signal 7: follower/following imbalance.
    const followers = Number(profile.followersCount) || 0;
    const following = Number(profile.followsCount) || 0;
    if (following >= 150 && following > followers * 3) {
      score += 10;
      evidence.push({ icon: "🫂", weight: 10, label: "mutual-chasing ratio", detail: `following ${following.toLocaleString()} accounts against ${followers.toLocaleString()} followers — that's a lot of hoping it gets reciprocated.` });
    } else if (followers >= 500 && followers >= following) {
      score -= 10;
      evidence.push({ icon: "⭐", weight: -10, label: "healthy follower ratio", detail: `${followers.toLocaleString()} followers, ${following.toLocaleString()} following — earned attention, not chased.` });
    }

    // Signal 8: building-in-public / shipped energy.
    const buildHits = [];
    for (const p of posts) {
      const hit = findPhrase(p.text.toLowerCase(), BUILD_PHRASES);
      if (hit) buildHits.push(p);
    }
    if (buildHits.length >= 2) {
      score -= 15;
      evidence.push({ icon: "🛠️", weight: -15, label: "building in public", detail: `${buildHits.length} posts about actually shipping things. hard to be ngmi while doing that.`, posts: citePosts(buildHits, 3) });
    }

    // Signal 9: said the quiet part — literally called themselves (or someone) ngmi.
    const ngmiHits = posts.filter((p) => /\bngmi\b/i.test(p.text));
    if (ngmiHits.length) {
      score += 8;
      evidence.push({ icon: "🗣️", weight: 8, label: "said it themselves", detail: `used the actual word "ngmi" ${ngmiHits.length} time${ngmiHits.length === 1 ? "" : "s"}. sometimes the quiet part isn't quiet.`, posts: citePosts(ngmiHits, 2) });
    }

    score = Math.max(0, Math.min(100, Math.round(score)));

    if (!evidence.length) {
      evidence.push({ icon: "🤷", weight: 0, label: "nothing flagged", detail: "no strong signal either way — a fairly unremarkable posting history." });
    }
    evidence.sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight));

    return {
      score,
      noData: false,
      verdict: verdictFor(score),
      totals: {
        posts: posts.length,
        replies: replies.length,
        original: original.length,
        spanDays: Math.round(spanDays),
        lastPostDaysAgo: lastPostDaysAgo === null ? null : Math.round(lastPostDaysAgo),
      },
      evidence,
      oldest: { createdAt: oldest.createdAt, url: oldest.url },
      newest: { createdAt: newest.createdAt, url: newest.url },
    };
  }

  global.NgmiAnalysis = { analyze, truncate, esc };
})(window);
