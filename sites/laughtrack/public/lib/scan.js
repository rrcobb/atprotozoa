// laughtrack scan engine — laughtrack.bisks.net
//
// Reads a Bluesky account's recent posts (their own posts AND their own
// replies — anything with their own words on it), pulls each one's reply
// thread, and counts lol/haha/omg/lmao/rofl-family exclamations across every
// reply from OTHER people. Whichever post racked up the most laugh markers
// in its replies is "the funniest thing they've posted" — deliberately not
// ranked by like count, which the brief explicitly said doesn't matter here.
// All public.api.bsky.app, CORS *, no auth. Concurrency helper is the same
// pooledEach shape as sites/topchicken/public/lib/scan.js (copy, don't
// abstract).

(function (global) {
  const PUB = "https://public.api.bsky.app/xrpc";

  // "every post" per @cee.wtf (2026-08-05: the first cut only looked at the
  // newest 50 and got called out for it). fetchOwnPosts now pages the whole
  // feed until the cursor runs dry. MAX_POSTS is a safety valve, not a
  // "recent only" cutoff — it exists so an account with tens of thousands of
  // posts can't hang a browser tab or hammer public.api.bsky.app forever.
  const MAX_POSTS = 2000;
  const FEED_PAGES = 40; // hard ceiling on getAuthorFeed pages, paired with MAX_POSTS above
  const THREAD_CONCURRENCY = 6;
  const THREAD_DEPTH = 8;
  const TOP_N = 20; // leaderboard length

  // Each family is matched with its own regex and tallied separately so the
  // UI can show a "lol: 4, haha: 2, 😂: 1" breakdown, not just one number.
  const MARKER_FAMILIES = [
    { key: "lol", label: "lol", re: /\bl(?:o+l)+\b/gi },
    { key: "haha", label: "haha", re: /\b(?:h+a+){2,}h*\b|\b(?:a+h+){2,}a*\b/gi },
    { key: "lmao", label: "lmao", re: /\blm+f?a+o+\b/gi },
    { key: "rofl", label: "rofl", re: /\broflm?a?o?\b/gi },
    { key: "omg", label: "omg", re: /\bomg+\b/gi },
    { key: "emoji", label: "😂", re: /😂|🤣/gu },
  ];

  // Counts every laugh-marker family in a chunk of text. Returns the total
  // occurrence count plus a per-family breakdown. "Count doesn't matter"
  // per the brief, so this is a flat sum, no weighting.
  function countLaughs(text) {
    if (!text) return { total: 0, byFamily: {} };
    const byFamily = {};
    let total = 0;
    for (const fam of MARKER_FAMILIES) {
      const matches = text.match(fam.re);
      const n = matches ? matches.length : 0;
      if (n) {
        byFamily[fam.key] = (byFamily[fam.key] || 0) + n;
        total += n;
      }
    }
    return { total, byFamily };
  }

  function mergeBreakdown(into, from) {
    for (const k of Object.keys(from)) into[k] = (into[k] || 0) + from[k];
    return into;
  }

  async function jget(url) {
    const r = await fetch(url);
    if (!r.ok) {
      const e = new Error(`HTTP ${r.status}`);
      e.status = r.status;
      throw e;
    }
    return r.json();
  }

  async function xrpc(method, params) {
    const u = new URL(`${PUB}/${method}`);
    for (const [k, v] of Object.entries(params || {})) u.searchParams.set(k, v);
    return jget(u.toString());
  }

  async function pooledEach(items, limit, fn) {
    let i = 0;
    async function worker() {
      while (i < items.length) {
        const idx = i++;
        await fn(items[idx], idx);
      }
    }
    await Promise.all(Array.from({ length: Math.min(limit, items.length) || 1 }, worker));
  }

  async function resolveActor(rawHandle) {
    let handle = (rawHandle || "").trim().replace(/^@/, "");
    const m = handle.match(/bsky\.app\/profile\/([^/\s?#]+)/i);
    if (m) handle = m[1];
    if (!handle) throw new Error("enter a handle first");
    const did = handle.startsWith("did:") ? handle : (await xrpc("com.atproto.identity.resolveHandle", { handle })).did;
    const profile = await xrpc("app.bsky.actor.getProfile", { actor: did });
    return { did, handle: profile.handle || handle, profile };
  }

  // Every post that's genuinely theirs — original posts and their own
  // replies — newest first, reposts excluded (a repost isn't their words).
  async function fetchOwnPosts(did) {
    const out = [];
    let cursor;
    for (let page = 0; page < FEED_PAGES; page++) {
      const params = { actor: did, limit: "100", filter: "posts_with_replies" };
      if (cursor) params.cursor = cursor;
      const feed = await xrpc("app.bsky.feed.getAuthorFeed", params);
      for (const item of feed.feed || []) {
        if (item.reason) continue; // repost, not their own words
        const post = item.post;
        const text = post && post.record && post.record.text;
        if (!post || typeof text !== "string" || !text.trim()) continue;
        out.push({ uri: post.uri, cid: post.cid, text, createdAt: post.record.createdAt || post.indexedAt });
      }
      cursor = feed.cursor;
      if (!cursor || !(feed.feed || []).length || out.length >= MAX_POSTS) break;
    }
    return out.slice(0, MAX_POSTS);
  }

  // Walks a getPostThread response's reply tree, tallying laugh markers in
  // every descendant reply NOT authored by the original poster (so someone
  // "lol"-ing in their own thread doesn't inflate their own score), while
  // still descending into deeper replies-to-replies — a laugh three levels
  // deep in the thread is still a reaction the post caused.
  function walkReplies(node, authorDid, acc) {
    const kids = (node && node.replies) || [];
    for (const kid of kids) {
      const post = kid && kid.post;
      if (post && post.author && post.author.did !== authorDid) {
        const text = post.record && post.record.text;
        const { total, byFamily } = countLaughs(text);
        acc.repliesScanned += 1;
        if (total > 0) {
          acc.total += total;
          mergeBreakdown(acc.byFamily, byFamily);
          acc.samples.push({
            author: post.author,
            text,
            count: total,
            url: `https://bsky.app/profile/${post.author.handle}/post/${(post.uri || "").split("/").pop()}`,
          });
        }
      }
      walkReplies(kid, authorDid, acc);
    }
    return acc;
  }

  async function scanPostReplies(uri, authorDid) {
    const acc = { total: 0, byFamily: {}, samples: [], repliesScanned: 0 };
    try {
      const data = await xrpc("app.bsky.feed.getPostThread", { uri, depth: String(THREAD_DEPTH), parentHeight: "0" });
      walkReplies(data.thread, authorDid, acc);
    } catch (_) {
      // a deleted post, a blocked thread, a rate-limited call — skip it,
      // don't sink the whole scan over one post
    }
    return acc;
  }

  // Full scan: resolve the handle, pull their recent posts, fetch every
  // post's reply thread (bounded concurrency), tally laugh markers, sort by
  // total descending. onProgress(done, total) fires as each thread finishes.
  async function scanFunniest(rawHandle, { onProgress } = {}) {
    const { did, handle, profile } = await resolveActor(rawHandle);
    const posts = await fetchOwnPosts(did);
    if (!posts.length) {
      return { did, handle, profile, results: [], scannedPosts: 0, scannedReplies: 0 };
    }

    let done = 0;
    let scannedReplies = 0;
    const results = new Array(posts.length);
    await pooledEach(posts, THREAD_CONCURRENCY, async (post, idx) => {
      const r = await scanPostReplies(post.uri, did);
      scannedReplies += r.repliesScanned;
      results[idx] = {
        uri: post.uri,
        text: post.text,
        createdAt: post.createdAt,
        url: `https://bsky.app/profile/${handle}/post/${post.uri.split("/").pop()}`,
        laughTotal: r.total,
        byFamily: r.byFamily,
        laughingReplies: r.samples.length,
        samples: r.samples.sort((a, b) => b.count - a.count).slice(0, 5),
      };
      done += 1;
      if (onProgress) onProgress(done, posts.length);
    });

    results.sort((a, b) => b.laughTotal - a.laughTotal || new Date(b.createdAt) - new Date(a.createdAt));

    return {
      did,
      handle,
      profile,
      results: results.filter((r) => r.laughTotal > 0).slice(0, TOP_N),
      scannedPosts: posts.length,
      scannedReplies,
    };
  }

  global.LaughtrackScan = { scanFunniest, countLaughs, MARKER_FAMILIES, MAX_POSTS };
})(window);
