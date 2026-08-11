// brawl.js — judges two public Bluesky accounts on five ridiculous but
// genuinely-read criteria: most cat pictures, most creative bio, wildest
// emoji rotation, hashtag hoarding, and longest-winded posting. Unlike the
// sibling sites on this theme (sillympics, fantasyduel, spellclash, botbattle
// — see their public/lib/tournament.js or duel.js), every score here comes
// straight out of real fetched content (the bio string, the actual text and
// image alt text of up to 100 recent posts) — no profile-stat-plus-seeded-
// jitter formula. The only RNG in this file breaks an exact-score tie, and
// it's seeded off the sorted DID pair (order-independent) same as the
// siblings' tieRng.

const TE = new TextEncoder();

function hash32(str) {
  let h = 5381;
  for (const b of TE.encode(str)) {
    h = ((h << 5) + h + b) >>> 0;
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pairSeed(profileA, profileB) {
  return [profileA.did, profileB.did].sort().join("|");
}

function tieRng(profileA, profileB, key) {
  return mulberry32(hash32(pairSeed(profileA, profileB) + "::" + key + "::tie"));
}

const EMOJI_RE = /\p{Extended_Pictographic}/gu;
const CAT_WORDS_RE = /\b(cats?|kitt(en|y|ies)?|meow+|felines?|tabby|tabbies|purr(s|ing|ed)?|whiskers?)\b/i;
const CAT_EMOJI = new Set(["🐱", "🐈", "😺", "😸", "😹", "😻", "😼", "😽", "🙀", "😿", "😾"]);

function extractImages(post) {
  const embed = post.embed;
  if (!embed) return [];
  if (embed.$type === "app.bsky.embed.images#view") return embed.images || [];
  if (embed.$type === "app.bsky.embed.recordWithMedia#view" && embed.media?.$type === "app.bsky.embed.images#view") {
    return embed.media.images || [];
  }
  return [];
}

export function postUrl(post) {
  const rkey = post.uri.split("/").pop();
  return `https://bsky.app/profile/${post.author.handle}/post/${rkey}`;
}

// Only reward images whose alt text or caption is actually, unmistakably
// about a cat — alt text is a real accessibility description someone wrote,
// so it's a genuine signal, not a guess off the image bytes.
function analyzeCats(posts) {
  const hits = [];
  for (const post of posts) {
    const images = extractImages(post);
    if (!images.length) continue;
    const text = post.record?.text || "";
    const altBlob = images.map((i) => i.alt || "").join(" ");
    const catEmojiHit = (text.match(EMOJI_RE) || []).some((e) => CAT_EMOJI.has(e));
    if (CAT_WORDS_RE.test(altBlob) || CAT_WORDS_RE.test(text) || catEmojiHit) {
      hits.push({ post, image: images[0] });
    }
  }
  return { score: hits.length, examples: hits.slice(0, 3) };
}

function scoreBio(bio) {
  if (!bio || !bio.trim()) return { score: 0, bio: "" };
  const words = bio.trim().split(/\s+/).filter(Boolean);
  const uniqueRatio = words.length ? new Set(words.map((w) => w.toLowerCase())).size / words.length : 0;
  // A one-word bio is trivially "100% unique words" — scale the variety
  // credit by word count too, so short bios can't max this out for free.
  const varietyWeight = Math.min(words.length / 6, 1);
  const emojiVariety = new Set(bio.match(EMOJI_RE) || []).size;
  const flair = (bio.match(/[—–…();:"“”]/g) || []).length;
  const lines = bio.split(/\r?\n/).filter((l) => l.trim()).length;
  let score = 0;
  score += uniqueRatio * varietyWeight * 28;
  score += (Math.min(bio.length, 220) / 220) * 24;
  score += Math.min(emojiVariety, 8) * 3;
  score += Math.min(flair, 10) * 1.6;
  score += Math.min(Math.max(lines - 1, 0), 5) * 3;
  return { score: Math.round(score), bio };
}

function analyzeEmoji(posts) {
  const counts = new Map();
  for (const post of posts) {
    const text = post.record?.text || "";
    for (const e of text.match(EMOJI_RE) || []) counts.set(e, (counts.get(e) || 0) + 1);
  }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  return { score: counts.size, top };
}

function analyzeHashtags(posts) {
  const counts = new Map();
  for (const post of posts) {
    const text = post.record?.text || "";
    for (const raw of text.match(/#[a-z0-9_]+/gi) || []) {
      const tag = raw.toLowerCase();
      counts.set(tag, (counts.get(tag) || 0) + 1);
    }
  }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  return { score: counts.size, top };
}

function analyzeWordiness(posts) {
  const withText = posts.map((p) => (p.record?.text || "").trim()).filter(Boolean);
  if (!withText.length) return { score: 0, longest: "" };
  const avg = withText.reduce((sum, t) => sum + t.length, 0) / withText.length;
  const longest = withText.reduce((a, b) => (b.length > a.length ? b : a), "");
  return { score: Math.round(avg), longest };
}

export const CRITERIA = [
  {
    key: "catpics",
    icon: "🐱",
    name: "Most Cat Pictures",
    unit: "cat pics",
    blurb: "images whose alt text or caption is unmistakably about a cat, out of their last 100 posts",
    judge(profile, posts) {
      return analyzeCats(posts);
    },
    line(w, wScore, l, lScore) {
      return `${w} posted ${wScore} unmistakable cat picture${wScore === 1 ? "" : "s"} to ${l}'s ${lScore} — a landslide for the felines.`;
    },
  },
  {
    key: "bio",
    icon: "✨",
    name: "Most Creative Bio",
    unit: "creativity pts",
    blurb: "word variety, length, emoji flair, and punctuation in the actual bio text",
    judge(profile) {
      return scoreBio(profile.description || "");
    },
    line(w, wScore, l, lScore) {
      return `${w}'s bio scores ${wScore} creativity points to ${l}'s ${lScore} — actually worth reading twice.`;
    },
  },
  {
    key: "emoji",
    icon: "🎭",
    name: "Wildest Emoji Rotation",
    unit: "distinct emoji",
    blurb: "how many different emoji show up across their last 100 posts",
    judge(profile, posts) {
      return analyzeEmoji(posts);
    },
    line(w, wScore, l, lScore) {
      return `${w} cycles through ${wScore} distinct emoji to ${l}'s ${lScore} — a genuinely unhinged rotation.`;
    },
  },
  {
    key: "hashtags",
    icon: "#️⃣",
    name: "Hashtag Hoarding",
    unit: "distinct tags",
    blurb: "how many different hashtags show up across their last 100 posts",
    judge(profile, posts) {
      return analyzeHashtags(posts);
    },
    line(w, wScore, l, lScore) {
      return `${w} hoards ${wScore} distinct hashtags to ${l}'s ${lScore} — a real problem, possibly a lifestyle.`;
    },
  },
  {
    key: "wordy",
    icon: "📏",
    name: "Longest-Winded",
    unit: "avg chars/post",
    blurb: "average length of their last 100 posts — rambling is rewarded here",
    judge(profile, posts) {
      return analyzeWordiness(posts);
    },
    line(w, wScore, l, lScore) {
      return `${w} averages ${wScore} characters a post to ${l}'s ${lScore} — never once considered brevity.`;
    },
  },
];

// Judges both profiles on all five criteria. Every score is a pure function
// of the fetched bio/posts, so a rematch between the same two handles always
// produces the same scores — it's a replay, not a reroll, unless one of them
// has posted again since.
export function runBrawl(profileA, postsA, profileB, postsB) {
  let winsA = 0;
  let winsB = 0;
  const results = CRITERIA.map((c) => {
    const a = c.judge(profileA, postsA);
    const b = c.judge(profileB, postsB);
    const aWins = a.score === b.score ? tieRng(profileA, profileB, c.key)() >= 0.5 : a.score > b.score;
    if (aWins) winsA++;
    else winsB++;
    return { criterion: c, a, b, winner: aWins ? "a" : "b" };
  });
  const champion = winsA === winsB ? null : winsA > winsB ? "a" : "b";
  return { results, winsA, winsB, champion };
}
