// beefcheck analysis engine — beefcheck.bisks.net
//
// @cee.wtf asked for a "are two accounts beefing" checker: sentiment
// analysis, reply/like counts, "active two-way engagement suddenly ending
// one day." No LLM behind this — a word-list sentiment pass and a handful of
// heuristics run over real interaction data the caller has already fetched
// (public/index.html does the fetching: getAuthorFeed for replies, /api/likes
// for like overlap, getRelationships for follow status).
//
// Input shape (see analyzePair below) is plain data, no network calls in
// here, so this file is easy to reason about and to unit-poke from a console.

(function (global) {
  // Small hand-written lexicon, same spirit as sites/epistemics's — literal
  // word matching, not a real sentiment model. Skews toward how people
  // actually talk in Bluesky replies (mild slang, emoji) rather than a
  // formal-English word list.
  const POSITIVE = [
    "love", "loved", "loving", "great", "amazing", "good", "thanks", "thank you",
    "appreciate", "haha", "lol", "lmao", "lmaooo", "agree", "based", "fair",
    "valid", "yeah", "yes", "exactly", "beautiful", "awesome", "glad", "happy",
    "proud", "congrats", "congratulations", "nice", "sweet", "yay", "🤝", "❤️",
    "😂", "🙏", "💛", "🥹", "😊", "🎉",
  ];
  const NEGATIVE = [
    "hate", "hated", "hating", "worst", "terrible", "awful", "bad", "stupid",
    "wrong", "disagree", "cringe", "garbage", "trash", "pathetic", "ridiculous",
    "shut up", "block", "unfollow", "gross", "ugh", "screw you", "screw this",
    "liar", "lying", "fake", "clown", "grow up", "unbelievable", "disgusting",
    "🙄", "💀", "🤡", "🚩",
  ];

  function tallySentiment(text) {
    if (!text) return 0;
    const lower = text.toLowerCase();
    let score = 0;
    for (const w of POSITIVE) if (lower.includes(w)) score += 1;
    for (const w of NEGATIVE) if (lower.includes(w)) score -= 1;
    return score;
  }

  function median(nums) {
    if (!nums.length) return null;
    const s = [...nums].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  }

  function daysBetween(isoA, isoB) {
    return Math.abs(Date.parse(isoB) - Date.parse(isoA)) / 86400000;
  }

  // Builds one chronological timeline out of every reply + like in either
  // direction, each tagged with who it came from and what kind it is.
  function buildTimeline(input) {
    const events = [];
    for (const r of input.repliesAtoB) events.push({ t: r.createdAt, kind: "reply", from: "a", text: r.text, url: r.postUrl });
    for (const r of input.repliesBtoA) events.push({ t: r.createdAt, kind: "reply", from: "b", text: r.text, url: r.postUrl });
    for (const l of input.likesAtoB) events.push({ t: l.createdAt, kind: "like", from: "a" });
    for (const l of input.likesBtoA) events.push({ t: l.createdAt, kind: "like", from: "b" });
    return events.filter((e) => e.t && !isNaN(Date.parse(e.t))).sort((a, b) => Date.parse(a.t) - Date.parse(b.t));
  }

  // Flags engagement that was reasonably steady and then just... stopped.
  // Needs at least 3 events spread over at least 10 days to say anything
  // meaningful about "steady" in the first place.
  function detectSuddenStop(timeline, now) {
    if (timeline.length < 3) return { stopped: false };
    const span = daysBetween(timeline[0].t, timeline[timeline.length - 1].t);
    if (span < 10) return { stopped: false };

    const gaps = [];
    for (let i = 1; i < timeline.length; i++) gaps.push(daysBetween(timeline[i - 1].t, timeline[i].t));
    const medGap = median(gaps) || 1;
    const last = timeline[timeline.length - 1];
    const sinceLast = daysBetween(last.t, now);

    const threshold = Math.max(30, medGap * 5);
    if (sinceLast > threshold) {
      return {
        stopped: true,
        sinceLast: Math.round(sinceLast),
        medianGapDays: Math.round(medGap * 10) / 10,
        lastAt: last.t,
        lastUrl: last.url || null,
      };
    }
    return { stopped: false, sinceLast: Math.round(sinceLast) };
  }

  // Latest event (reply or like) out of one side's interactions, carrying
  // the post URL when it's a reply (likes don't point at the liker's own
  // words, so there's nothing worth linking to for those).
  function lastEventOf(replies, likes) {
    const events = [
      ...replies.map((r) => ({ t: r.createdAt, url: r.postUrl || null })),
      ...likes.map((l) => ({ t: l.createdAt, url: null })),
    ].filter((e) => e.t);
    events.sort((x, y) => Date.parse(x.t) - Date.parse(y.t));
    return events.length ? events[events.length - 1] : null;
  }

  // One side keeps showing up, the other stopped responding — a different
  // shape from a mutual sudden stop: the relationship didn't go quiet, it
  // went one-way.
  function detectAsymmetricSilence(input, now) {
    const lastA = lastEventOf(input.repliesAtoB, input.likesAtoB);
    const lastB = lastEventOf(input.repliesBtoA, input.likesBtoA);
    const countA = input.repliesAtoB.length + input.likesAtoB.length;
    const countB = input.repliesBtoA.length + input.likesBtoA.length;

    if (!lastA || !lastB) return { asymmetric: false };
    if (countA < 2 || countB < 2) return { asymmetric: false }; // too little data on one side to call it a pattern

    const gapDays = daysBetween(lastA.t, lastB.t);
    // one side's most recent contact trails the other's by more than a
    // month, on a pair that otherwise has real back-and-forth history
    if (gapDays > 30) {
      const quietIsA = Date.parse(lastA.t) < Date.parse(lastB.t);
      return {
        asymmetric: true,
        quietSide: quietIsA ? "a" : "b",
        gapDays: Math.round(gapDays),
        lastUrl: quietIsA ? lastA.url : lastB.url,
      };
    }
    return { asymmetric: false };
  }

  function verdictFor(score) {
    if (score >= 71) return { label: "that's beef", blurb: "real beef. the receipts line up more than one way." };
    if (score >= 41) return { label: "something's up", blurb: "there's a pattern here that doesn't read as nothing." };
    if (score >= 16) return { label: "a little frosty", blurb: "not a full falling-out, but the warmth's cooled off." };
    return { label: "looking fine", blurb: "no beef detected — could just be two people who don't talk much." };
  }

  function fmtHandle(h) {
    return "@" + h;
  }

  function analyzePair(input) {
    // input: { a: {did, handle}, b: {did, handle},
    //          repliesAtoB, repliesBtoA: [{createdAt, text, postUrl}],
    //          likesAtoB, likesBtoA: [{createdAt}],
    //          followingAB, followingBA: bool,
    //          partialSides: string[] (handles whose full repo download
    //          failed, so this pair leans on a recent-history sample for
    //          that side instead of their whole history) }
    const now = input.now || new Date().toISOString();
    const partialSides = input.partialSides || [];

    const totals = {
      repliesAtoB: input.repliesAtoB.length,
      repliesBtoA: input.repliesBtoA.length,
      likesAtoB: input.likesAtoB.length,
      likesBtoA: input.likesBtoA.length,
    };
    const totalInteractions = totals.repliesAtoB + totals.repliesBtoA + totals.likesAtoB + totals.likesBtoA;

    const evidence = [];
    const partialNote = partialSides.length
      ? [{
          icon: "📡",
          weight: 0,
          label: "partial data for " + partialSides.map(fmtHandle).join(" & "),
          detail: `couldn't download ${partialSides.length > 1 ? "their" : fmtHandle(partialSides[0]) + "'s"} full repo — using a recent-history sample for ${partialSides.length > 1 ? "those sides" : "that side"} instead of their whole history.`,
        }]
      : [];

    if (totalInteractions === 0) {
      return {
        score: 0,
        noContact: true,
        verdict: { label: "no history found", blurb: "can't call it beef with zero contact — these two just don't seem to interact." },
        totals,
        mutuals: input.followingAB && input.followingBA,
        evidence: partialNote,
        timeline: [],
        suddenStop: { stopped: false },
        asymmetric: { asymmetric: false },
        sentiment: { total: 0, aBoutB: 0, bAboutA: 0 },
      };
    }

    const timeline = buildTimeline(input);
    const sentimentAtoB = input.repliesAtoB.reduce((s, r) => s + tallySentiment(r.text), 0);
    const sentimentBtoA = input.repliesBtoA.reduce((s, r) => s + tallySentiment(r.text), 0);
    const sentimentTotal = sentimentAtoB + sentimentBtoA;

    const suddenStop = detectSuddenStop(timeline, now);
    const asymmetric = detectAsymmetricSilence(input, now);
    const mutuals = input.followingAB && input.followingBA;

    let score = 0;

    // Signal 1: follow status. The strongest single tell — someone who was
    // engaged enough to reply or like repeatedly and then unfollowed is a
    // real, deliberate action, not ambiguity.
    if (!input.followingAB && !input.followingBA) {
      score += 40;
      evidence.push({ icon: "🚫", weight: 40, label: "mutual unfollow", detail: `neither ${fmtHandle(input.a.handle)} nor ${fmtHandle(input.b.handle)} follows the other anymore, despite ${totalInteractions} logged interactions.` });
    } else if (!input.followingAB || !input.followingBA) {
      const who = !input.followingAB ? input.a.handle : input.b.handle;
      const whom = !input.followingAB ? input.b.handle : input.a.handle;
      score += 25;
      evidence.push({ icon: "👋", weight: 25, label: "one-way unfollow", detail: `${fmtHandle(who)} no longer follows ${fmtHandle(whom)}, though they used to interact.` });
    }

    // Signal 2: sentiment in the replies they've actually exchanged.
    if (sentimentTotal <= -3) {
      score += 25;
      evidence.push({ icon: "🌡️", weight: 25, label: "negative tone", detail: `their replies to each other skew sharply negative (word-list sentiment score ${sentimentTotal}).` });
    } else if (sentimentTotal < 0) {
      score += 12;
      evidence.push({ icon: "🌡️", weight: 12, label: "cooler tone", detail: `slightly more negative than positive language in their exchanged replies (score ${sentimentTotal}).` });
    } else if (sentimentTotal > 2) {
      evidence.push({ icon: "💬", weight: 0, label: "warm tone", detail: `their exchanged replies read positive overall (score +${sentimentTotal}) — not a beef signal.` });
    }

    // Signal 3: sudden stop after a steady run.
    if (suddenStop.stopped) {
      score += 30;
      evidence.push({
        icon: "📉",
        weight: 30,
        label: "engagement went quiet",
        detail: `they interacted roughly every ${suddenStop.medianGapDays} days, then nothing for ${suddenStop.sinceLast} days since ${new Date(suddenStop.lastAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}.`,
        url: suddenStop.lastUrl || null,
      });
    }

    // Signal 4: one side went quiet while the other kept showing up.
    if (asymmetric.asymmetric) {
      const quietHandle = asymmetric.quietSide === "a" ? input.a.handle : input.b.handle;
      score += 15;
      evidence.push({
        icon: "📵",
        weight: 15,
        label: "one-sided silence",
        detail: `${fmtHandle(quietHandle)}'s side of the exchange stopped about ${asymmetric.gapDays} days before the other's did.`,
        url: asymmetric.lastUrl || null,
      });
    }

    // Signal 5: total lopsidedness — one account interacts a lot, the other
    // almost never reciprocates, at all, ever (independent of timing).
    const aCount = totals.repliesAtoB + totals.likesAtoB;
    const bCount = totals.repliesBtoA + totals.likesBtoA;
    if (totalInteractions >= 4 && (aCount === 0 || bCount === 0)) {
      score += 10;
      const quiet = aCount === 0 ? input.a.handle : input.b.handle;
      evidence.push({ icon: "➡️", weight: 10, label: "entirely one-directional", detail: `every logged interaction runs one way — ${fmtHandle(quiet)} has never replied to or liked the other.` });
    }

    score = Math.max(0, Math.min(100, Math.round(score)));

    if (!evidence.length) {
      evidence.push({ icon: "✅", weight: 0, label: "nothing flagged", detail: "reply tone is neutral-to-positive, engagement looks active or unremarkable, and they're still mutuals." });
    }
    evidence.push(...partialNote);

    return {
      score,
      noContact: false,
      verdict: verdictFor(score),
      totals,
      totalInteractions,
      mutuals,
      followingAB: input.followingAB,
      followingBA: input.followingBA,
      evidence: evidence.sort((x, y) => y.weight - x.weight),
      timeline,
      suddenStop,
      asymmetric,
      sentiment: { total: sentimentTotal, aBoutB: sentimentAtoB, bAboutA: sentimentBtoA },
    };
  }

  global.BeefcheckAnalysis = { analyzePair, tallySentiment, buildTimeline, lastEventOf };
})(window);
