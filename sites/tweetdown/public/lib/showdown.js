// tweetdown engine. Two usernames go in, six made-up categories get judged,
// and a champion gets crowned. Nothing is fetched — there's no such thing as
// a real tweet here, just a seeded RNG having opinions about two strings.
//
// The seed is derived from the two names (order-independent for the pair,
// order-sensitive for who's "a" vs "b"), so the same two handles always
// produce the same showdown — reroll by typing something different, not by
// mashing the button.

export function cleanHandle(raw) {
  let s = (raw || "").trim();
  if (!s) return "";
  s = s.replace(/^@+/, "");
  return "@" + s;
}

// FNV-1a, good enough for a seed, no dependency needed.
function hashStr(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

function pickN(rng, arr, n) {
  const pool = arr.slice();
  const out = [];
  while (out.length < n && pool.length) {
    const i = Math.floor(rng() * pool.length);
    out.push(pool.splice(i, 1)[0]);
  }
  return out;
}

const AVATARS = ["\u{1F426}", "\u{1F985}", "\u{1F99C}", "\u{1F438}", "\u{1F999}", "\u{1F43C}", "\u{1F98A}", "\u{1F42D}", "\u{1F419}", "\u{1F994}", "\u{1F995}", "\u{1F9A9}"];

export function avatarFor(name) {
  const rng = mulberry32(hashStr("avatar:" + name.toLowerCase()));
  return pick(rng, AVATARS);
}

const CATEGORIES = [
  {
    id: "creative", name: "Most Creative Tweets",
    lines: [
      "{w} posts a 4am thought so unhinged it gets screenshotted into three group chats. {l}'s best line this week was \"lol same.\"",
      "{w} invents a whole bit out of nothing and rides it for eleven replies. {l} quote-tweets it going \"real\" and that's the whole contribution.",
      "{w}'s timeline reads like a fever dream with excellent grammar. {l}'s reads like a fortune cookie factory recall.",
    ],
  },
  {
    id: "catjoke", name: "Best Cat Joke",
    lines: [
      "{w} lands a cat pun so clean {l} mutes the word \"cat\" for a week.",
      "{w}'s cat joke gets 40 replies of just the crying-laughing emoji. {l}'s cat joke is just a picture of a cat with no caption, which, respectfully, is cheating.",
      "{w} somehow works Schrödinger into a joke about a cat knocking a cup off a table. {l} says \"meow\" and calls it a night.",
    ],
  },
  {
    id: "quotetweet", name: "Quote-Tweet Dunk Accuracy",
    lines: [
      "{w} quote-tweets with a single devastating word. {l} writes four paragraphs and still doesn't land it.",
      "{w}'s dunk is so surgical the original poster deletes their whole account. {l}'s dunk gets ratio'd by the person they were dunking on.",
      "{w} quote-tweets, adds nothing but a screenshot of the time stamp, and it's somehow the funniest post of the day. {l} tries the same move and it just reads as confused.",
    ],
  },
  {
    id: "replyguy", name: "Reply-Guy Stamina",
    lines: [
      "{w} is still in someone's mentions eleven hours later, actually winning now. {l} tapped out after reply four, which, honestly, is the healthier choice.",
      "{w} replies to a stranger's post about soup with a 900-word essay. {l} likes their own reply for moral support.",
      "{w} out-lasts an entire comment section through sheer force of will. {l} gets blocked somewhere around hour two.",
    ],
  },
  {
    id: "thread", name: "Thread-Length Endurance",
    lines: [
      "{w} posts a 47-tweet thread about a parking garage and somehow it's riveting. {l} threads two tweets and calls it \"a thread.\"",
      "{w}'s thread has a table of contents. {l}'s thread has a typo in tweet 1 that never gets fixed.",
      "{w} numbers every tweet (14/47) with total confidence. {l} loses count by tweet six and just starts using emoji.",
    ],
  },
  {
    id: "emoji", name: "Emoji Virtuosity",
    lines: [
      "{w} builds an entire sentence out of emoji and it's somehow legible. {l} uses the skull emoji fourteen times and calls it range.",
      "{w} deploys a genuinely novel emoji combo that starts a small trend. {l} still thinks 👌👌 is doing something.",
      "{w}'s emoji game is so precise it reads as a second language. {l} sends a single 😭 and considers the discourse closed.",
    ],
  },
  {
    id: "ratio", name: "Ratio Survival Instinct",
    lines: [
      "{w} gets ratio'd, deletes nothing, and posts again within the hour like it never happened. {l} would've quote-tweeted an apology.",
      "{w} takes an L in the replies and turns it into content. {l} takes the same L and goes quiet for three days.",
      "{w} has been ratio'd so many times it's basically a personality trait at this point, worn with pride. {l} still checks the notification count with visible dread.",
    ],
  },
  {
    id: "screenshot", name: "Screenshot-Ability",
    lines: [
      "{w} posts something so quotable it's in a slideshow by Tuesday. {l}'s best post this month got two likes, one of them self-inflicted.",
      "{w}'s post gets cropped, reposted, and misattributed within the hour — true virality. {l}'s post gets screenshotted exactly once, by their mom.",
      "{w} says the thing everyone was thinking, and now it's a screenshot forever. {l} says the thing nobody was thinking, and it's forgotten by lunch.",
    ],
  },
  {
    id: "3am", name: "Unhinged 3am Posting",
    lines: [
      "{w} posts something at 3am that reads like a diary entry with the safety off. {l} is asleep like a coward.",
      "{w}'s 3am posts have their own devoted readership at this point. {l} tried it once, regretted it by 9am, and deleted the evidence.",
      "{w} live-tweets a spiral about nothing in particular and it slaps. {l} posts \"can't sleep\" and gets zero engagement, as deserved.",
    ],
  },
  {
    id: "maincharacter", name: "Main-Character Energy",
    lines: [
      "{w} turns a trip to the DMV into a six-part saga with a satisfying arc. {l} narrates their commute like it's a hostage situation, and not the fun kind.",
      "{w} somehow makes everyone else in the replies a supporting character in their own story. {l} is a background extra in their own timeline.",
      "{w} announces a minor inconvenience like it's breaking news and gets away with it completely. {l} tries the same bit and just seems mad about traffic.",
    ],
  },
  {
    id: "typo", name: "Typo Recovery Speed",
    lines: [
      "{w} types \"defiantly\" instead of \"definitely,\" notices, and just leaves it in — commits to the bit. {l} deletes and reposts within four seconds, everyone saw the typo anyway.",
      "{w} turns a genuine typo into a running joke that outlives the original post. {l} quote-tweets their own typo to apologize, which nobody asked for.",
      "{w} misspells a simple word and somehow it reads as a stylistic choice. {l} corrects it in the replies, alone, to a post nobody read.",
    ],
  },
  {
    id: "vaguepost", name: "Vague-Posting Mastery",
    lines: [
      "{w} posts \"not everyone deserves an explanation\" and eleven people privately assume it's about them. {l} tries vague-posting and just sounds confused.",
      "{w}'s vague post is vague enough to apply to everyone and specific enough to worry three people by name. {l} accidentally tags the person it's about.",
      "{w} achieves a vague post so airtight even their own friends can't crack it. {l}'s \"vague\" post has a screenshot attached, which defeats the purpose.",
    ],
  },
  {
    id: "biolink", name: "Bio Link Commitment",
    lines: [
      "{w}'s bio link has been the same broken Linktree since 2022 and it's part of their charm now. {l} changes their bio link weekly, chasing a dream.",
      "{w} commits so hard to one (1) bio link that it's basically a personal landmark. {l}'s bio link 404s and nobody's told them yet.",
      "{w}'s bio is three words and a link and somehow says everything. {l}'s bio is 200 characters of pure vibes and zero information.",
    ],
  },
  {
    id: "wordle", name: "Wordle Bragging Rights",
    lines: [
      "{w} posts the little green squares and it's genuinely a flex today. {l} posts theirs too, six guesses, in yellow shame.",
      "{w} gets it in two and has the audacity to say \"lucky guess\" like anyone believes them. {l} doesn't post theirs at all, which says plenty.",
      "{w}'s Wordle grid gets a reply of pure jealousy. {l}'s Wordle grid gets a reply correcting their strategy, unsolicited.",
    ],
  },
];

const OPENERS = [
  "Two accounts step up to the timeline.",
  "The replies are already loading.",
  "Nobody asked for this showdown, and yet.",
  "The mutuals have gathered. It's happening.",
];

const TIE_LINES = [
  "Dead even. Both sides screenshot the tie and post it as a win.",
  "A perfect stalemate — the internet's rarest outcome, a draw nobody's mad about.",
  "Exactly tied, which means the replies will argue about this forever.",
];

export function simulateShowdown(nameA, nameB) {
  const key = `${nameA.toLowerCase()}::${nameB.toLowerCase()}`;
  const rng = mulberry32(hashStr(key));

  const opener = pick(rng, OPENERS);
  const chosen = pickN(rng, CATEGORIES, 6);

  let scoreA = 0, scoreB = 0;
  const rounds = chosen.map((cat) => {
    const aWins = rng() < 0.5;
    if (aWins) scoreA++; else scoreB++;
    const winnerName = aWins ? nameA : nameB;
    const loserName = aWins ? nameB : nameA;
    const template = pick(rng, cat.lines);
    const line = template.replace("{w}", winnerName).replace(/\{l\}/g, loserName);
    return { category: cat.name, side: aWins ? "a" : "b", line };
  });

  let tie = scoreA === scoreB;
  let winner = tie ? null : scoreA > scoreB ? "a" : "b";
  let suddenDeath = null;

  if (tie) {
    // Sudden death: one more seeded flip, clearly marked as such, so a tie
    // still resolves to a champion instead of leaving the page hanging.
    const sdWins = rng() < 0.5;
    winner = sdWins ? "a" : "b";
    const cat = pick(rng, CATEGORIES);
    const template = pick(rng, cat.lines);
    const winnerName = sdWins ? nameA : nameB;
    const loserName = sdWins ? nameB : nameA;
    suddenDeath = {
      category: cat.name,
      line: template.replace("{w}", winnerName).replace(/\{l\}/g, loserName),
      tieLine: pick(rng, TIE_LINES),
    };
  }

  const winName = winner === "a" ? nameA : nameB;
  const loseName = winner === "a" ? nameB : nameA;
  const winScore = winner === "a" ? scoreA : scoreB;
  const loseScore = winner === "a" ? scoreB : scoreA;

  const verdict = tie
    ? `${scoreA}-${scoreB} after six categories, so it went to sudden death. ${suddenDeath.tieLine}`
    : `${winName} takes it ${winScore}-${loseScore}. ${loseName} demands a recount; the replies are not sympathetic.`;

  return {
    nameA, nameB, opener, rounds,
    scoreA, scoreB, tie, winner, suddenDeath,
    koLine: `\u{1F3C6} ${winName.toUpperCase()} WINS THE TWEETDOWN`,
    verdict,
  };
}
