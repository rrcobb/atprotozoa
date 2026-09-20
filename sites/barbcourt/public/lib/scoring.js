// scoring.js — the pure game logic behind barbcourt: scenarios, ranks, and
// the house decorum-meter. No DOM access here on purpose, so this file loads
// (and its scoring can be tested) under plain Node, not just a browser.

export const NAMES = [
  "Lady Pemberton-Vail", "Lord Ashgrove", "Mrs. Thistlewood", "Sir Reginald Bloor",
  "the Dowager Duchess of Frimley", "Colonel Wexford", "Miss Ottoline Crake",
  "Mr. Aloysius Fenwick", "Lady Blythswood", "the Honourable Cressida Marchmont",
  "Baron von Steeple", "Mrs. Featherstonehaugh", "young Master Pinchbeck",
  "Aunt Agatha", "Cousin Bartholomew", "the Vicar's wife", "Lady Wintermere",
  "Mr. Cadwallader Thorne", "the new Countess of Ashby", "your former governess Miss Prynne",
  "Lord Fitzwilliam Grubb", "Mrs. Ravensworth-Hume", "the American heiress Miss Dabney",
  "old General Pettibone",
];

export const SCENARIOS = [
  "{n} announces, loudly enough for three rooms to hear, that your family's fortune “came from trade, of course.”",
  "{n} admires your gown and asks, with wide eyes, whether it was let out.",
  "{n} introduces you to the room by the wrong, less flattering, married name.",
  "{n} remarks that your novel-writing is “such a charming little hobby” for someone your age.",
  "{n} wonders aloud, within your hearing, whether you'll ever marry, or whether that ship has “quite sailed.”",
  "{n} compliments your restraint in not attempting the waltz, “given everything.”",
  "{n} asks after your sibling's health, then adds that THEY, at least, married well.",
  "{n} praises your cook's efforts tonight, having clearly expected far worse.",
  "{n} says your opinions are “refreshingly bold” for someone of your station.",
  "{n} hopes your family's business troubles haven't been “too terribly embarrassing.”",
  "{n} “forgets,” three times this evening, that you were invited at all.",
  "{n} tells you, unprompted, that grief becomes some people more than others.",
  "{n} congratulates you on your engagement — to the wrong person entirely — and does not correct it.",
  "{n} says your accent has “improved so much” since you arrived in town.",
  "{n} suggests your poetry reading was “certainly ambitious.”",
  "{n} wonders whether plainer bonnets might suit some faces better than others.",
  "{n} remarks that it's “brave” of you to attend at all, given the talk.",
  "{n} says your new carriage is lovely, and wonders aloud who you borrowed it from.",
  "{n} thanks you for coming despite “everything people are saying.”",
  "{n} tells the table your family used to be “quite somebody,” once.",
  "{n} asks whether your intended will be joining you tonight, or whether they've found something better to do.",
  "{n} says your French is “coming along” after only fifteen years of lessons.",
  "{n} remarks that you look “well rested” for someone in your situation.",
  "{n} loudly wonders, to no one in particular, who let you in.",
];

export const RANKS = [
  { min: 0, title: "Not Received" },
  { min: 150, title: "Barely Tolerated" },
  { min: 400, title: "Talked About" },
  { min: 750, title: "Invited Back" },
  { min: 1200, title: "In Demand" },
  { min: 1750, title: "Arbiter of Taste" },
  { min: 2400, title: "Terror of the Drawing-Room" },
  { min: 3200, title: "Toast of the Season" },
  { min: 4200, title: "Sovereign of Society" },
];

// Victorian register markers. Each match nudges the score up — the game
// rewards the sound of decorum, since that's the whole joke of the genre.
const FLOURISH = [
  /\bindeed\b/i, /\bquite\b/i, /\brather\b/i, /\bI dare ?say\b/i, /\bone simply\b/i,
  /\bbless (?:your|his|her|their)\b/i, /\bhow (?:novel|brave|singular|delightful|touching|generous)\b/i,
  /\bfor (?:one|someone) of your\b/i, /\bconsidering\b/i, /\bsurely\b/i, /\bpracticall?y\b/i,
  /\bscandal(?:ous)?\b/i, /\bimpertinent\b/i, /\bwanting in\b/i, /\bbeneath\b/i,
  /\bforgive me\b/i, /\bno doubt\b/i, /\bI(?:'m| am) (?:sure|certain) you\b/i, /\bhow (?:kind|good) of you\b/i,
];

// Direct modern crudeness reads as a failure of nerve here, not wit — the
// game's premise is that the cut has to be elegant enough to survive polite
// company. Keeping this list also means you can't win by typing something
// genuinely nasty, since real slurs/harassment aren't "clever" in-genre either.
const CRUDE = [
  /\bidiot\b/i, /\bstupid\b/i, /\bshut up\b/i, /\bhate you\b/i, /\bugly\b/i,
  /\bdumb\b/i, /\bmoron\b/i, /\bloser\b/i, /\bsucks?\b/i, /\bkill yourself\b/i,
  /\bfuck/i, /\bshit\b/i, /\bbitch\b/i, /\bwhore\b/i, /\bslut\b/i, /\bretard/i,
];

export function rankFor(standing) {
  let r = RANKS[0];
  for (const cand of RANKS) if (standing >= cand.min) r = cand;
  return r;
}

export function nextRankFor(standing) {
  return RANKS.find((r) => r.min > standing) || null;
}

export function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function newScenario() {
  const name = pick(NAMES);
  const template = pick(SCENARIOS);
  return { name, text: template.replace("{n}", name) };
}

// The house decorum-meter: heuristic scoring, no key or network required.
export function heuristicScore(text) {
  const clean = (text || "").trim();
  const words = clean.split(/\s+/).filter(Boolean);
  const wc = words.length;
  if (wc === 0) return { score: 0, verdict: "Vulgar", reaction: "You say nothing at all. The room notices." };

  let score = 50;

  if (wc < 4) score -= 25;
  else if (wc <= 28) score += 12;
  else if (wc > 45) score -= 15;

  const longWords = words.filter((w) => w.replace(/[^a-zA-Z]/g, "").length >= 7).length;
  score += Math.min(20, Math.round((longWords / wc) * 60));

  const flourishHits = FLOURISH.reduce((n, re) => n + (re.test(clean) ? 1 : 0), 0);
  score += Math.min(20, flourishHits * 7);

  if (/[—;]/.test(clean)) score += 5; // em dash or semicolon: a flourish of structure
  if (/[“”"]/.test(clean)) score += 5; // quoting the provocation back is a known move

  const isCrude = CRUDE.some((re) => re.test(clean));
  score = Math.max(0, Math.min(100, Math.round(score)));
  if (isCrude) score = Math.min(score, 28);

  let verdict, reaction;
  if (isCrude) {
    verdict = "Vulgar";
    reaction = "A collective wince. That was blunt, not cutting — there's a difference, and everyone here knows it.";
  } else if (score >= 88) {
    verdict = "Triumph";
    reaction = "A collective, delighted gasp. Someone's teacup does not survive.";
  } else if (score >= 72) {
    verdict = "Adequate";
    reaction = "Muffled laughter behind fans. You've drawn real blood.";
  } else if (score >= 52) {
    verdict = "Adequate";
    reaction = "A few smirks. Adequate, if not something anyone will repeat tomorrow.";
  } else {
    verdict = "Misfire";
    reaction = "Silence. Someone changes the subject out of pity for you.";
  }

  return { score, verdict, reaction };
}

// Parses the strict-format reply the LLM judge is prompted to return. Split
// out from the fetch call itself so it can be unit tested without a network.
export function parseJudgeReply(raw) {
  const scoreM = raw.match(/SCORE:\s*(\d+)/i);
  const verdictM = raw.match(/VERDICT:\s*(\w+)/i);
  const reactionM = raw.match(/REACTION:\s*(.+)/i);
  if (!scoreM || !reactionM) throw new Error("The judge's reply didn't parse.");

  return {
    score: Math.max(0, Math.min(100, parseInt(scoreM[1], 10))),
    verdict: verdictM ? verdictM[1] : "Adequate",
    reaction: reactionM[1].trim(),
  };
}

export function judgeSystemPrompt() {
  return (
    "You are a panel of scandalized Victorian aristocrats judging a cutting remark for wit, " +
    "elegance, and social precision, delivered in response to a social provocation. Score " +
    "harshly — most remarks are middling, and a 90+ should be rare. Reward indirection, " +
    "restraint, and precise cruelty dressed as politeness. Penalize crude modern insults, " +
    "rambling, and remarks with no real bite. Reply in EXACTLY this format and nothing else:\n" +
    "SCORE: <integer 0-100>\nVERDICT: <one word: Triumph, Adequate, Misfire, or Vulgar>\n" +
    "REACTION: <one in-character sentence describing how the room reacts>"
  );
}
