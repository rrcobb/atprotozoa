// mnemonic.js — given two people whose avatars hashed close together
// (vision.js), work out what to actually tell a human so they can tell the
// two pfps apart, and phrase it as something worth remembering.
//
// Two layers, tried in order:
//
//   1. Content-based: read each poster's bio and recent posts (moots.js's
//      getPersonContext) and pull out the one sentence that's most *theirs*
//      — the sentence with the most words that don't show up anywhere in
//      the other person's bio/posts. That sentence gets rephrased from
//      first person into third ("i work on eurosky" -> "kira works on
//      eurosky") so it reads as a fact about them, not a quote. This is
//      the "you need to read their posts/bios to disambiguate them" half
//      of the ask — a pfp color never told anyone why two specific humans
//      aren't the same human.
//   2. Pfp-based fallback, unchanged from the original: color, then
//      brightness, then saturation, then which corner is brightest, then
//      alphabetical order — for whichever half of the pair (or both) has
//      no bio/post text distinctive enough to build a sentence from.
//
// Either way, both halves of the final mnemonic get a short rhyming tag
// stitched on (see RHYME_PAIRS) — that's the "oh and they should rhyme"
// follow-up. The tags are a small fixed vocabulary, not a rhyming
// dictionary: the actual distinguishing content is the clause before the
// tag, the tag's only job is to land on a matched sound so the two lines
// read as a couplet instead of two unrelated facts.

const QUAD_NAMES = ["top-left", "top-right", "bottom-left", "bottom-right"];

function colorName(hsl) {
  const { h, s, l } = hsl;
  if (l < 14) return "near-black";
  if (l > 90) return "near-white";
  if (s < 14) return "gray";
  if (h < 15 || h >= 345) return "red";
  if (h < 45) return "orange";
  if (h < 70) return "yellow";
  if (h < 160) return "green";
  if (h < 195) return "teal";
  if (h < 250) return "blue";
  if (h < 290) return "purple";
  if (h < 330) return "pink";
  return "red";
}

function brightnessWord(l) {
  if (l < 30) return "dark";
  if (l < 45) return "dim";
  if (l > 82) return "pale";
  if (l > 65) return "bright";
  return null; // unremarkable middle — not worth calling out
}

function satWord(s) {
  if (s < 18) return "muted";
  if (s > 60) return "vivid";
  return null;
}

function brightestQuadrant(quadrants) {
  let best = 0;
  for (let i = 1; i < quadrants.length; i++) if (quadrants[i] > quadrants[best]) best = i;
  return best;
}

function truncate(s, max) {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

function yearOf(iso) {
  const m = /^(\d{4})-/.exec(iso || "");
  return m ? m[1] : null;
}

function handleDomain(handle) {
  return (handle || "").toLowerCase().endsWith(".bsky.social") ? "bsky.social" : "a custom domain";
}

// A fact about the two PEOPLE, not their pfps — only fires when the caller
// passed enriched profile data (a.description/a.createdAt), which
// describePair's callers only bother fetching for pairs that actually made
// it into the results, not every mutual. Checked in order of how useful a
// memory hook it makes: differing bios, then who's been around longer, then
// handle domain. Returns null (nothing to add) when none of that data is
// present or none of it differs.
export function posterHint(a, b) {
  const bioA = (a.description || "").trim();
  const bioB = (b.description || "").trim();
  if (bioA && bioB && bioA !== bioB) {
    return `their bios don't match either — @${a.handle}: "${truncate(bioA, 70)}" vs @${b.handle}: "${truncate(bioB, 70)}".`;
  }
  if (bioA && !bioB) return `only @${a.handle} has written a bio ("${truncate(bioA, 70)}") — @${b.handle}'s is blank.`;
  if (bioB && !bioA) return `only @${b.handle} has written a bio ("${truncate(bioB, 70)}") — @${a.handle}'s is blank.`;

  const yearA = yearOf(a.createdAt), yearB = yearOf(b.createdAt);
  if (yearA && yearB && yearA !== yearB) {
    return `@${a.handle} has been on Bluesky since ${yearA}, @${b.handle} since ${yearB}.`;
  }

  const domA = handleDomain(a.handle), domB = handleDomain(b.handle);
  if (domA !== domB) {
    return `@${a.handle}'s handle is on ${domA}, @${b.handle}'s is on ${domB}.`;
  }

  return null;
}

// ---- content-based disambiguation (bio + recent posts) ----------------

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "of", "to", "in", "on", "for", "is",
  "are", "was", "were", "be", "been", "being", "it", "this", "that", "these",
  "those", "with", "as", "at", "by", "from", "i", "you", "he", "she", "they",
  "we", "my", "your", "his", "her", "their", "our", "me", "him", "them", "us",
  "not", "no", "so", "if", "just", "like", "its", "it's", "im", "i'm",
  "i've", "have", "has", "had", "do", "does", "did", "will", "would", "can",
  "could", "should", "about", "what", "when", "who", "how", "why", "there",
  "here", "out", "up", "down", "over", "also", "than", "then", "one", "get",
  "got", "all", "some", "more", "most", "very", "really", "still", "even",
  "only", "into", "you're", "don't", "yeah", "gonna", "going", "know",
  "think", "want", "need", "www", "http", "https", "com", "net", "org",
  "amp", "rt", "u", "ur", "lol", "new", "now",
]);

function words(text) {
  return ((text || "").toLowerCase().match(/[a-z0-9']+/g) || []);
}

function contentWords(text) {
  return words(text).filter((w) => w.length >= 3 && !STOPWORDS.has(w));
}

// Drop links and @mentions before scoring/displaying — neither one reads
// as a mnemonic clause.
function stripNoise(s) {
  return (s || "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/@[a-zA-Z0-9.-]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function splitSentences(text) {
  return stripNoise(text)
    .split(/\n+|(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// Combined bio + recent-posts text for one person, used as the pool the
// OTHER person's sentence gets checked against for distinctiveness.
function textCorpus(person) {
  return [person.description || "", ...(person.posts || [])].join(" ");
}

// Verbs that don't take an -s in third person, or already read fine
// unmodified — skip the naive pseudo-conjugation for these.
const NO_S_VERBS = new Set([
  "am", "is", "are", "was", "were", "have", "has", "had", "can", "could",
  "will", "would", "shall", "should", "may", "might", "must", "do", "does",
  "did", "don't", "doesn't", "didn't", "won't", "can't", "isn't", "wasn't",
  "aren't", "weren't",
]);

const PRONOUN_LEAD_RE = /^(i'm|i am|im|i've|my|i)\s/i;

// Rewrite one clause's opener from first person to third. `subject` is
// either the person's name (singular — "is"/verb+s/"'s") or "they"
// (plural — "are"/bare verb/"their"), so the same logic covers both the
// clause that introduces the name and any later clause that picks the
// pronoun back up (see toThirdPerson).
function transformOpening(subject, s, plural) {
  const lower = s.toLowerCase();
  const be = plural ? "are" : "is";
  if (lower.startsWith("i'm ")) return `${subject} ${be} ${s.slice(4)}`;
  if (lower.startsWith("i am ")) return `${subject} ${be} ${s.slice(5)}`;
  if (lower.startsWith("im ")) return `${subject} ${be} ${s.slice(3)}`;
  if (lower.startsWith("i've ")) return `${plural ? "they've" : subject + "'s"} ${s.slice(5)}`;
  if (lower.startsWith("my ")) return `${plural ? "their" : subject + "'s"} ${s.slice(3)}`;
  if (lower.startsWith("i ")) {
    const rest = s.slice(2);
    if (plural) return `${subject} ${rest}`; // "they work on eurosky" — no -s needed
    const m = /^([a-zA-Z']+)(\s|$)([\s\S]*)/.exec(rest);
    if (m && !NO_S_VERBS.has(m[1].toLowerCase()) && !/s$/i.test(m[1])) {
      return `${subject} ${m[1]}s${m[2]}${m[3]}`;
    }
    return `${subject} ${rest}`;
  }
  // No leading pronoun — could be a noun-phrase fragment ("the trans
  // catgirl who can't stop buying dgx sparks", wants "<subject> is ...")
  // or a clause that already opens on a verb/modal ("can't stop thinking
  // about eurosky", where prepending "is" would read as "is can't stop…").
  // Only add "is"/"are" when the opening word isn't itself a verb/modal.
  const opener = /^[a-zA-Z']+/.exec(s)?.[0]?.toLowerCase();
  if (opener && NO_S_VERBS.has(opener)) return `${subject} ${s.charAt(0).toLowerCase()}${s.slice(1)}`;
  return `${subject} ${be} ${s.charAt(0).toLowerCase()}${s.slice(1)}`;
}

// Turn a first-person bio/post sentence into third person so it reads as a
// fact ABOUT the poster rather than a quote FROM them —
// "i work on eurosky" -> "kira works on eurosky". Bios are often one
// comma-spliced run-on ("software engineer, i work on eurosky in my spare
// time"), so this transforms clause by clause: the first clause anchors on
// the person's name, and any later clause that picks the "i" back up
// switches to "they" instead of repeating the name.
export function toThirdPerson(name, sentence) {
  const parts = sentence.split(/\s*,\s*/).filter(Boolean);
  if (!parts.length) return sentence;
  const out = [transformOpening(name, parts[0].trim(), false)];
  for (let i = 1; i < parts.length; i++) {
    const p = parts[i].trim();
    out.push(PRONOUN_LEAD_RE.test(p + " ") ? transformOpening("they", p, true) : p);
  }
  return out.join(", ");
}

// Pick the single sentence (from bio, else recent posts) that's most
// distinctly THIS person's — scored by how many of its content words never
// show up anywhere in the other person's bio/posts. Bio sentences get a
// small bonus since a bio is a deliberate self-description, not a passing
// post. Returns null when there's no bio/post text, or nothing in it is
// distinctive enough to be worth a sentence (score 0 — every content word
// in every candidate sentence also appears in the other person's corpus).
export function buildContentFact(person, otherCorpusText) {
  const name = person.displayName || person.handle;
  const otherWords = new Set(contentWords(otherCorpusText));

  const candidates = [];
  for (const s of splitSentences(person.description)) candidates.push({ text: s, bonus: 2 });
  for (const post of person.posts || []) {
    for (const s of splitSentences(post)) candidates.push({ text: s, bonus: 0 });
  }

  let best = null;
  let bestScore = -1;
  for (const c of candidates) {
    if (c.text.length < 8 || c.text.length > 140) continue; // too short to be a fact, too long for a mnemonic line
    const cw = contentWords(c.text);
    if (!cw.length) continue;
    const distinct = new Set(cw.filter((w) => !otherWords.has(w)));
    if (!distinct.size) continue; // the bio bonus below is a tiebreaker, not enough on its own to call a sentence "distinctive"
    const score = distinct.size * 10 + c.bonus;
    if (score > bestScore) {
      bestScore = score;
      best = c.text;
    }
  }
  if (!best) return null;
  return toThirdPerson(name, truncate(best, 100));
}

// ---- rhyme -------------------------------------------------------------

// Closing tags, paired so the two halves of any pair rhyme when read aloud.
// A tiny fixed vocabulary rather than a real rhyming dictionary — the
// content clause in front of the tag is what actually disambiguates the
// two people; the tag's only job is to land both lines on a matched sound.
const RHYME_PAIRS = [
  ["remember that", "tip your hat"],
  ["keep that in mind", "or so you'll find"],
  ["know them well", "that's the tell"],
  ["there's your clue", "plain and true"],
  ["wait and see", "that's the key"],
  ["that's the sign", "read the line"],
  ["stays crystal clear", "keep it near"],
  ["get it right", "keep in sight"],
];

function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

// Deterministic per pair (no Math.random) so the same two handles always
// get the same rhyme — makes the output testable and stops the couplet
// from reshuffling on every re-run against the same two people.
function pickRhymeTags(a, b) {
  const idx = hashStr(`${a.handle}|${b.handle}`) % RHYME_PAIRS.length;
  return RHYME_PAIRS[idx];
}

// Returns { pct, lineA, lineB, mnemonic, posterNote }. `pct` is similarity
// 0-100 (64 - hammingDistance, scaled) purely for display, not used in the
// text. `posterNote` is a fact about the people rather than the photos —
// null unless the caller passed enriched `a`/`b` (see posterHint above).
// `mnemonic` prefers a fact pulled from each person's own bio/posts
// (buildContentFact) and falls back to the pfp-trait cascade only for
// whichever half of the pair has no distinctive text to draw from; both
// halves always end on a rhyming tag.
export function describePair(a, b, featA, featB, hammingDist) {
  const pct = Math.round(((64 - hammingDist) / 64) * 100);
  const posterNote = posterHint(a, b);
  const nameA = a.displayName || a.handle;
  const nameB = b.displayName || b.handle;

  const colorA = colorName(featA.hsl), colorB = colorName(featB.hsl);
  const brightA = brightnessWord(featA.hsl.l), brightB = brightnessWord(featB.hsl.l);
  const satA = satWord(featA.hsl.s), satB = satWord(featB.hsl.s);

  const anchorFor = (word, name) => {
    const initial = name.trim()[0]?.toLowerCase();
    return initial && word[0] === initial
      ? `${name} — “${word}” starts the same as their name`
      : `${name} is the ${word} one`;
  };

  let lineA, lineB, pfpClauseA, pfpClauseB;

  if (colorA !== colorB && colorA !== "gray" && colorB !== "gray") {
    lineA = `@${a.handle}'s pfp reads ${colorA}${brightA ? ` and ${brightA}` : ""}.`;
    lineB = `@${b.handle}'s pfp reads ${colorB}${brightB ? ` and ${brightB}` : ""}.`;
    pfpClauseA = anchorFor(colorA, nameA);
    pfpClauseB = `${nameB} is the ${colorB} one`;
  } else if (brightA && brightB && brightA !== brightB) {
    lineA = `@${a.handle}'s pfp is the ${brightA} one.`;
    lineB = `@${b.handle}'s pfp is the ${brightB} one.`;
    pfpClauseA = anchorFor(brightA, nameA);
    pfpClauseB = `${nameB} is the ${brightB} one`;
  } else if (satA && satB && satA !== satB) {
    lineA = `@${a.handle}'s pfp is the ${satA} one.`;
    lineB = `@${b.handle}'s pfp is the ${satB} one.`;
    pfpClauseA = anchorFor(satA, nameA);
    pfpClauseB = `${nameB} is the ${satA === "vivid" ? "muted" : "vivid"} one`;
  } else {
    const quadA = brightestQuadrant(featA.quadrants), quadB = brightestQuadrant(featB.quadrants);
    if (quadA !== quadB) {
      lineA = `@${a.handle}'s brightest spot sits ${QUAD_NAMES[quadA]}.`;
      lineB = `@${b.handle}'s brightest spot sits ${QUAD_NAMES[quadB]}.`;
      pfpClauseA = `${nameA} is bright ${QUAD_NAMES[quadA]}`;
      pfpClauseB = `${nameB} is bright ${QUAD_NAMES[quadB]}`;
    } else {
      // Same color family, same brightness/saturation band, same highlight
      // corner — genuinely nothing visual left to hang a memory on. The one
      // reliable difference left is the names themselves.
      const order = nameA.localeCompare(nameB) <= 0 ? [nameA, nameB] : [nameB, nameA];
      lineA = `@${a.handle}'s pfp is about as close a match to @${b.handle}'s as pfps get.`;
      lineB = `same tone, same brightness, same layout — no visual anchor left.`;
      pfpClauseA = `${nameA}'s pfp gives nothing away here`;
      pfpClauseB = `go alphabetical — ${order[0]} before ${order[1]}`;
    }
  }

  const contentA = buildContentFact(a, textCorpus(b));
  const contentB = buildContentFact(b, textCorpus(a));
  const clauseA = contentA || pfpClauseA;
  const clauseB = contentB || pfpClauseB;
  const [tagA, tagB] = pickRhymeTags(a, b);
  const mnemonic = `${clauseA}, ${tagA}; ${clauseB}, ${tagB}.`;

  return { pct, posterNote, lineA, lineB, mnemonic };
}
