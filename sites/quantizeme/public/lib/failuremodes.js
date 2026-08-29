// quantizeme's analysis engine — bisks.net/quantizeme
//
// The brief: scan someone's posts, find failure modes in their thinking, and
// assign the size (in GB) of the LLM that has similar failure modes. There's
// no LLM wired into this Worker (no key, no binding for one — see the
// Cloudflare cost wall in builder/INSTRUCTIONS.md), so this is the honest
// version: a plain heuristic reader, same spirit as sites/epistemics ("prolog
// for beliefs") and sites/llmstance. It doesn't understand anyone's
// arguments — it greps for the textual tells of eight failure modes and adds
// up a score, then maps that score onto a joke-but-grounded LLM size:
// smaller/more-quantized models look more like the loud, all-or-nothing
// failure modes (repetition, whiplash, unearned certainty); bigger ones look
// more like the subtler, load-bearing ones (whataboutism, strawmanning,
// hedge fog dressed up as nuance). The eight detectors below duplicate two
// of epistemics' (Reversal, Certainty Whiplash) plus its claim-extraction
// machinery outright — copy, don't abstract, even across sites.
//
// Exposed as window.FailureModes for the client page. A smaller, hand-
// duplicated version of the scoring lives in src/index.ts for the server-side
// /s/<handle> OG unfurl — same reasoning as epistemics/llmstance duplicating
// their tables into the Worker.
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
  const WHATABOUT = [
    "what about", "yeah but what about", "but what about", "no one talks about",
    "nobody talks about", "meanwhile nobody mentions", "but nobody's talking about",
    "but nobodys talking about", "and yet nobody",
  ];
  const STRAWMAN = [
    "so you're saying", "so youre saying", "so basically you're saying",
    "so basically youre saying", "so what you're saying is", "so what youre saying is",
    "sounds like you think", "so your argument is", "so according to you",
    "oh so now you're saying", "oh so now youre saying",
  ];
  const DOOM = [
    "we're doomed", "were doomed", "we are doomed", "it's over", "its over",
    "it is over", "everything is over", "beyond saving", "too late to fix",
    "nothing matters anymore", "society is collapsing", "world is ending",
    "there's no coming back", "theres no coming back", "there is no coming back",
    "point of no return", "we're cooked", "were cooked", "we are cooked",
    "the end of civilization", "humanity is finished",
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
        const whatabout = containsAny(lower, WHATABOUT);
        const strawman = containsAny(lower, STRAWMAN);
        const doom = containsAny(lower, DOOM);
        if (
          !pos.length && !neg.length && !absPos.length && !absNeg.length &&
          !hedge.length && !certainty.length && !stance.length &&
          !whatabout.length && !strawman.length && !doom.length
        ) {
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
          whatabout: whatabout.length > 0,
          strawman: strawman.length > 0,
          doom: doom.length > 0,
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

  // Broken Record: near-duplicate sentences across the whole post history —
  // the tell of a small or over-quantized model stuck repeating a loop.
  // Normalizes each sentence (not just claim-bearing ones) and flags any
  // that show up 2+ times across different posts.
  function findRepeats(posts) {
    const seen = new Map(); // normalized text -> [{text, uri, postUrl}]
    for (const post of posts) {
      for (const sentence of splitSentences(post.text)) {
        if (sentence.length < 25) continue; // short sentences repeat naturally, not a tell
        const norm = sentence.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
        if (!norm) continue;
        if (!seen.has(norm)) seen.set(norm, []);
        const bucket = seen.get(norm);
        if (!bucket.some((b) => b.uri === post.uri)) {
          bucket.push({ text: sentence, uri: post.uri, postUrl: post.postUrl });
        }
      }
    }
    const repeats = [];
    for (const [norm, bucket] of seen) {
      if (bucket.length >= 2) repeats.push({ norm, occurrences: bucket });
    }
    repeats.sort((a, b) => b.occurrences.length - a.occurrences.length);
    return repeats;
  }

  const SIN_INFO = {
    Reversal: {
      icon: "⇆",
      severity: 3,
      modelNote: "the failure mode of an undertrained model that gives you a different answer if you just ask again",
    },
    "Certainty Whiplash": {
      icon: "⚡",
      severity: 2,
      modelNote: "always-to-never in one sitting — a model with zero calibration on its own confidence",
    },
    "Hedge Fog": {
      icon: "☁️",
      severity: 1,
      modelNote: "buries every stance in hedge tokens, like a heavily-RLHF'd model terrified of ever being wrong",
    },
    "Main Character Certainty": {
      icon: "❗",
      severity: 1,
      modelNote: "declares things \"obviously\" true with nothing behind it — classic undertrained-base-model overconfidence",
    },
    Whataboutism: {
      icon: "↩️",
      severity: 2,
      modelNote: "deflects to a different topic mid-argument, the tell of a model that's wandered past its context window",
    },
    Strawman: {
      icon: "🎭",
      severity: 2,
      modelNote: "restates the other side's position wrong before rebutting it, like a model that skimmed the prompt",
    },
    "Doom Loop": {
      icon: "💀",
      severity: 1,
      modelNote: "catastrophizes every topic into an ending, a model stuck in a negative-sentiment attractor state",
    },
    "Broken Record": {
      icon: "🔁",
      severity: 2,
      modelNote: "says almost the same sentence more than once, the classic repetition loop of a small or over-quantized model",
    },
  };

  function buildSins(claims, posts) {
    const { reversals, whiplash } = findContradictions(claims);
    const repeats = findRepeats(posts);
    const sins = [];

    function push(category, weight, summary, items) {
      if (!weight) return;
      const info = SIN_INFO[category];
      sins.push({ category, icon: info.icon, severity: info.severity, modelNote: info.modelNote, weight, summary, items });
    }

    push(
      "Reversal",
      reversals.length,
      `${reversals.length} topic${reversals.length === 1 ? "" : "s"} argued both ways`,
      reversals.slice(0, 6).map((r) => ({
        topic: r.topic,
        quotes: [r.a, r.b].map((c) => ({ text: truncate(c.text, 220), uri: c.uri, postUrl: c.postUrl })),
      }))
    );

    push(
      "Certainty Whiplash",
      whiplash.length,
      `${whiplash.length} topic${whiplash.length === 1 ? "" : "s"} went from "always" to "never"`,
      whiplash.slice(0, 6).map((r) => ({
        topic: r.topic,
        quotes: [r.a, r.b].map((c) => ({ text: truncate(c.text, 220), uri: c.uri, postUrl: c.postUrl })),
      }))
    );

    const hedgeClaims = claims.filter((c) => c.hedge);
    if (claims.length >= 6 && hedgeClaims.length / claims.length >= 0.22 && hedgeClaims.length >= 3) {
      push("Hedge Fog", hedgeClaims.length, `${hedgeClaims.length} of ${claims.length} positions came wrapped in a hedge`, [
        { topic: null, quotes: hedgeClaims.slice(0, 3).map((c) => ({ text: truncate(c.text, 220), uri: c.uri, postUrl: c.postUrl })) },
      ]);
    }

    const certaintyClaims = claims.filter((c) => c.certainty);
    if (certaintyClaims.length >= 4) {
      push(
        "Main Character Certainty",
        certaintyClaims.length,
        `${certaintyClaims.length} statements were "obviously" / "literally" true, no further evidence supplied`,
        [{ topic: null, quotes: certaintyClaims.slice(0, 3).map((c) => ({ text: truncate(c.text, 220), uri: c.uri, postUrl: c.postUrl })) }]
      );
    }

    const whataboutClaims = claims.filter((c) => c.whatabout);
    if (whataboutClaims.length >= 2) {
      push(
        "Whataboutism",
        whataboutClaims.length,
        `${whataboutClaims.length} time${whataboutClaims.length === 1 ? "" : "s"} the subject changed instead of the point getting answered`,
        [{ topic: null, quotes: whataboutClaims.slice(0, 3).map((c) => ({ text: truncate(c.text, 220), uri: c.uri, postUrl: c.postUrl })) }]
      );
    }

    const strawmanClaims = claims.filter((c) => c.strawman);
    if (strawmanClaims.length >= 2) {
      push(
        "Strawman",
        strawmanClaims.length,
        `${strawmanClaims.length} time${strawmanClaims.length === 1 ? "" : "s"} someone else's point got restated before getting knocked down`,
        [{ topic: null, quotes: strawmanClaims.slice(0, 3).map((c) => ({ text: truncate(c.text, 220), uri: c.uri, postUrl: c.postUrl })) }]
      );
    }

    const doomClaims = claims.filter((c) => c.doom);
    if (doomClaims.length >= 2) {
      push(
        "Doom Loop",
        doomClaims.length,
        `${doomClaims.length} posts declared something over, doomed, or beyond saving`,
        [{ topic: null, quotes: doomClaims.slice(0, 3).map((c) => ({ text: truncate(c.text, 220), uri: c.uri, postUrl: c.postUrl })) }]
      );
    }

    if (repeats.length) {
      push(
        "Broken Record",
        repeats.length,
        `${repeats.length} sentence${repeats.length === 1 ? "" : "s"} posted more than once, nearly word for word`,
        repeats.slice(0, 4).map((r) => ({
          topic: null,
          quotes: r.occurrences.slice(0, 3).map((o) => ({ text: truncate(o.text, 220), uri: o.uri, postUrl: o.postUrl })),
        }))
      );
    }

    sins.sort((a, b) => b.severity * b.weight - a.severity * a.weight);
    return sins;
  }

  function scoreFor(sins) {
    return sins.reduce((sum, s) => sum + s.severity * s.weight, 0);
  }

  // The joke, made concrete: map the total score onto a real-ish parameter
  // count + quantization + a GB figure, low to high. Smaller/heavier-
  // quantized models get mapped to louder, more structural failure modes
  // (this score range); bigger ones get mapped to "still fails, just with
  // more compute behind the confidence."
  const TIERS = [
    {
      max: 0,
      gb: "0 GB",
      spec: "no model — nothing measurable",
      blurb: "clean scan. either remarkably consistent, or remarkably quiet — a heuristic can't tell you which.",
    },
    {
      max: 3,
      gb: "~0.7 GB",
      spec: "1.1B params, Q4_K_M quant — phone-sized",
      blurb: "small hiccups. the kind of thing a tiny quantized model does once every few dozen replies.",
    },
    {
      max: 8,
      gb: "~4.1 GB",
      spec: "7B params, Q4_K_M quant — the classic laptop model",
      blurb: "a real pattern, not a fluke. about as consistent as a 7B chat model on a slow Tuesday.",
    },
    {
      max: 15,
      gb: "~19 GB",
      spec: "34B params, Q4_K_M quant — needs a real GPU",
      blurb: "confident, wrong, and confident about being wrong. scaling up didn't fix it, it just got louder.",
    },
    {
      max: 25,
      gb: "~40 GB",
      spec: "70B params, Q4_K_M quant — needs a rig",
      blurb: "big enough to sound authoritative while contradicting itself in two directions at once.",
    },
    {
      max: 40,
      gb: "~140 GB",
      spec: "70B params, full fp16 — needs a rack",
      blurb: "the failure modes didn't shrink at this scale. the receipts just got heavier.",
    },
    {
      max: Infinity,
      gb: "~230 GB+",
      spec: "405B-class, quantized — needs a small datacenter",
      blurb: "frontier-scale inconsistency. somebody should file an incident report.",
    },
  ];

  function tierFor(score) {
    return TIERS.find((t) => score <= t.max);
  }

  // The "prolog for beliefs" idea (via sites/epistemics) was "keep track of
  // every position ... on any issue," not just the ones that flip. The sins
  // list is the highlight reel; the docket is the full ledger — every topic
  // that came up more than once, every claim about it, oldest first.
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
    const sins = buildSins(claims, posts);
    const score = scoreFor(sins);
    const docket = buildDocket(claims);
    return { claims, sins, score, tier: tierFor(score), docket };
  }

  global.FailureModes = { analyze, splitSentences, extractClaims, buildSins, buildDocket, scoreFor, tierFor, TIERS, SIN_INFO };
})(window);
