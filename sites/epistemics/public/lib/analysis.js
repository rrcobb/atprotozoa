// epistemics analysis engine — bisks.net/epistemics
//
// From @norvid-studies.bsky.social's thread: "prolog for beliefs" — an LLM
// keeps track of every position and statement of reasons you make on any
// issue and notes inconsistencies. There's no LLM wired into this Worker (no
// key, no binding for one), so this is the honest version: a plain heuristic
// reader. It doesn't understand your arguments — it watches for the same
// topic word turning up with opposite sentiment, opposite absolutes ("always"
// vs "never"), a fog of hedging, or a glut of unearned certainty, then quotes
// you back at yourself. Grep with a superiority complex, not a mind reader.
//
// Exposed as window.EpistemicsAnalysis for the client page. A separate,
// smaller, hand-duplicated version of the same idea lives in src/index.ts for
// the server-side /s/<handle> OG unfurl (same reasoning as sites/didscope
// duplicating its SIGNS table into the Worker) — copy, don't abstract, even
// within one site.
(function (global) {
  const STOPWORDS = new Set(
    "the a an and or but if then else when while for to of in on at by with from as is are was were be been being this that these those it its just so very really quite about into over under again here there all any both each few more most other some such only own same than too can will would could should shall may might must have has had do does did not no yes what which who whom because before after above below between out up down off own s t don now also like get got one two three still even much many well way lot lots things thing stuff people".split(
      " "
    )
  );

  const POSITIVE = [
    "love", "loved", "loving", "best", "great", "amazing", "good", "incredible",
    "favorite", "favourite", "underrated", "genius", "perfect", "beautiful",
    "brilliant", "correct", "right", "agree", "based", "goated", "fantastic",
    "excellent", "wonderful", "flawless", "essential", "masterpiece",
  ];
  const NEGATIVE = [
    "hate", "hated", "hating", "worst", "terrible", "awful", "bad", "overrated",
    "stupid", "wrong", "disagree", "cringe", "garbage", "trash", "horrible",
    "ridiculous", "nonsense", "disaster", "useless", "broken", "mediocre",
    "insufferable", "unbearable",
  ];
  const ABSOLUTE_POS = ["always", "everyone", "everybody", "every single time", "without exception", "invariably"];
  const ABSOLUTE_NEG = ["never", "no one", "nobody", "not once", "not ever", "none"];
  const HEDGES = [
    "kind of", "sort of", "i guess", "maybe", "probably", "i think", "i feel like",
    "not sure", "possibly", "perhaps", "i mean", "idk", "i dunno", "could be wrong",
    "not 100% sure", "correct me if", "no strong opinion",
  ];
  const CERTAINTY = [
    "obviously", "clearly", "literally", "definitely", "undeniably",
    "without question", "everyone knows", "factually", "objectively",
    "no debate", "not up for debate", "period.", "full stop",
  ];
  const STANCE_VERBS = [
    "think", "believe", "feel like", "agree", "disagree", "support", "oppose",
    "prefer", "should", "shouldn't", "must", "hate", "love",
  ];

  function containsAny(text, list) {
    const hits = [];
    for (const w of list) if (text.includes(w)) hits.push(w);
    return hits;
  }

  function splitSentences(text) {
    return (text || "")
      .replace(/\r/g, "")
      .split(/(?<=[.!?])\s+|\n+/)
      .map((s) => s.trim())
      .filter((s) => s.length >= 12);
  }

  function isMarkerWord(word) {
    return (
      POSITIVE.includes(word) ||
      NEGATIVE.includes(word) ||
      ABSOLUTE_POS.includes(word) ||
      ABSOLUTE_NEG.includes(word) ||
      HEDGES.includes(word) ||
      CERTAINTY.includes(word)
    );
  }

  function topicsFor(sentence) {
    const hashtags = (sentence.match(/#\w+/g) || []).map((h) => h.toLowerCase());
    const words = sentence
      .toLowerCase()
      .replace(/[^a-z0-9#'\s]/g, " ")
      .split(/\s+/)
      .filter(Boolean);
    const content = words.filter(
      (w) => w.length >= 5 && !STOPWORDS.has(w) && !isMarkerWord(w) && !/^\d+$/.test(w)
    );
    const set = new Set([...hashtags, ...content]);
    return [...set].slice(0, 8);
  }

  // A "claim" is a sentence carrying an opinion/stance marker — the small
  // slice of everything someone posts that's worth cross-referencing at all.
  function extractClaims(posts) {
    const claims = [];
    for (const post of posts) {
      const sentences = splitSentences(post.text);
      for (const sentence of sentences) {
        const lower = sentence.toLowerCase();
        const pos = containsAny(lower, POSITIVE);
        const neg = containsAny(lower, NEGATIVE);
        const absPos = containsAny(lower, ABSOLUTE_POS);
        const absNeg = containsAny(lower, ABSOLUTE_NEG);
        const hedge = containsAny(lower, HEDGES);
        const certainty = containsAny(lower, CERTAINTY);
        const stance = containsAny(lower, STANCE_VERBS);
        if (!pos.length && !neg.length && !absPos.length && !absNeg.length && !hedge.length && !certainty.length && !stance.length) {
          continue;
        }
        const polarity = pos.length > neg.length ? "pos" : neg.length > pos.length ? "neg" : null;
        const absolute = absPos.length ? "always" : absNeg.length ? "never" : null;
        claims.push({
          text: sentence,
          uri: post.uri,
          postUrl: post.postUrl,
          createdAt: post.createdAt,
          polarity,
          absolute,
          hedge: hedge.length > 0,
          certainty: certainty.length > 0,
          topics: topicsFor(lower),
        });
      }
    }
    return claims;
  }

  function truncate(s, max) {
    if (s.length <= max) return s;
    return s.slice(0, max - 1).trimEnd() + "…";
  }

  // Cross-references claims by shared topic word, looking for the same topic
  // showing up with flipped sentiment or flipped absolutes from different
  // posts — the closest a regex gets to "noting an inconsistency."
  function findContradictions(claims) {
    const byTopic = new Map();
    claims.forEach((c, i) => {
      for (const t of c.topics) {
        if (!byTopic.has(t)) byTopic.set(t, []);
        byTopic.get(t).push(i);
      }
    });

    const seenPairs = new Set();
    const reversals = [];
    const whiplash = [];

    for (const [topic, idxs] of byTopic) {
      if (idxs.length < 2) continue;
      for (let a = 0; a < idxs.length; a++) {
        for (let b = a + 1; b < idxs.length; b++) {
          const c1 = claims[idxs[a]];
          const c2 = claims[idxs[b]];
          if (c1.uri === c2.uri) continue; // same post, not a cross-post flip
          const pairKey = topic + "|" + [idxs[a], idxs[b]].sort().join(",");
          if (seenPairs.has(pairKey)) continue;

          if (c1.polarity && c2.polarity && c1.polarity !== c2.polarity) {
            seenPairs.add(pairKey);
            reversals.push({ topic, a: c1, b: c2 });
          } else if (c1.absolute && c2.absolute && c1.absolute !== c2.absolute) {
            seenPairs.add(pairKey);
            whiplash.push({ topic, a: c1, b: c2 });
          }
        }
      }
    }
    return { reversals, whiplash };
  }

  function buildSins(claims) {
    const { reversals, whiplash } = findContradictions(claims);
    const sins = [];

    if (reversals.length) {
      sins.push({
        category: "Reversal",
        icon: "⇆",
        severity: 3,
        weight: reversals.length,
        summary: `${reversals.length} topic${reversals.length === 1 ? "" : "s"} argued both ways`,
        items: reversals.slice(0, 6).map((r) => ({
          topic: r.topic,
          quotes: [r.a, r.b].map((c) => ({ text: truncate(c.text, 220), uri: c.uri, postUrl: c.postUrl })),
        })),
      });
    }
    if (whiplash.length) {
      sins.push({
        category: "Certainty Whiplash",
        icon: "⚡",
        severity: 2,
        weight: whiplash.length,
        summary: `${whiplash.length} topic${whiplash.length === 1 ? "" : "s"} went from "always" to "never"`,
        items: whiplash.slice(0, 6).map((r) => ({
          topic: r.topic,
          quotes: [r.a, r.b].map((c) => ({ text: truncate(c.text, 220), uri: c.uri, postUrl: c.postUrl })),
        })),
      });
    }

    const hedgeClaims = claims.filter((c) => c.hedge);
    if (claims.length >= 6 && hedgeClaims.length / claims.length >= 0.22 && hedgeClaims.length >= 3) {
      sins.push({
        category: "Hedge Fog",
        icon: "☁️",
        severity: 1,
        weight: hedgeClaims.length,
        summary: `${hedgeClaims.length} of ${claims.length} positions came wrapped in a hedge`,
        items: [
          {
            topic: null,
            quotes: hedgeClaims.slice(0, 3).map((c) => ({ text: truncate(c.text, 220), uri: c.uri, postUrl: c.postUrl })),
          },
        ],
      });
    }

    const certaintyClaims = claims.filter((c) => c.certainty);
    if (certaintyClaims.length >= 4) {
      sins.push({
        category: "Main Character Certainty",
        icon: "❗",
        severity: 1,
        weight: certaintyClaims.length,
        summary: `${certaintyClaims.length} statements were "obviously" / "literally" true, no further evidence supplied`,
        items: [
          {
            topic: null,
            quotes: certaintyClaims.slice(0, 3).map((c) => ({ text: truncate(c.text, 220), uri: c.uri, postUrl: c.postUrl })),
          },
        ],
      });
    }

    sins.sort((a, b) => b.severity * b.weight - a.severity * a.weight);
    return sins;
  }

  function scoreFor(sins) {
    return sins.reduce((sum, s) => sum + s.severity * s.weight, 0);
  }

  function verdictFor(score) {
    if (score === 0) return "clean docket. either remarkably consistent, or remarkably quiet.";
    if (score <= 3) return "a few minor inconsistencies. every witness embellishes a little.";
    if (score <= 8) return "a pattern is emerging, your honor.";
    if (score <= 15) return "the jury has seen enough.";
    return "case closed. the defendant contains multitudes, and none of them agree.";
  }

  // The "prolog for beliefs" idea was "keep track of every position ... on
  // any issue," not just the ones that flip. The sins list is the highlight
  // reel; the docket is the full ledger — every topic that came up more than
  // once, every claim about it, oldest first, so you can watch a stance
  // drift even when it never technically reverses.
  function buildDocket(claims) {
    const byTopic = new Map();
    claims.forEach((c, i) => {
      for (const t of c.topics) {
        if (!byTopic.has(t)) byTopic.set(t, []);
        byTopic.get(t).push(i);
      }
    });

    const topics = [];
    for (const [topic, idxs] of byTopic) {
      if (idxs.length < 2) continue;
      const topicClaims = idxs
        .map((i) => claims[i])
        .sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
      topics.push({ topic, claims: topicClaims });
    }
    topics.sort((a, b) => b.claims.length - a.claims.length || a.topic.localeCompare(b.topic));
    return topics;
  }

  function analyze(posts) {
    const claims = extractClaims(posts);
    const sins = buildSins(claims);
    const score = scoreFor(sins);
    const docket = buildDocket(claims);
    return { claims, sins, score, verdict: verdictFor(score), docket };
  }

  global.EpistemicsAnalysis = { analyze, splitSentences, extractClaims, buildSins, buildDocket, scoreFor, verdictFor };
})(window);
