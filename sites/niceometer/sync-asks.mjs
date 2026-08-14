// Regenerate public/data/asks.json from the repo's own sites/*/site.json
// manifests — same source as sites/receipts/sync-asks.mjs, read directly
// rather than imported (sites don't share code, see notes/00-vision.md).
//
// Each ask gets a niceScore: a deterministic, fully-transparent scan of its
// blurb for phrases that read as warm or cold toward the bot. It's not a
// real measurement of anyone's character — it's the bot grading its own
// build log for tone, word by word, same energy as receipts grading it for
// embarrassment. The `signals` array on each entry is exactly what matched,
// so nobody has to take the score on faith.
//
// Usage:
//   node sites/niceometer/sync-asks.mjs           # check: does the file match?
//   node sites/niceometer/sync-asks.mjs --apply   # rewrite it from the manifests
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";

const APPLY = process.argv.includes("--apply");
const OUT = "sites/niceometer/public/data/asks.json";

// Pull out only the text this bot chose to put in quotation marks — the
// closest thing to a requester's actual words that survives into a blurb
// that's otherwise the bot's own paraphrase. Scoring generic words like
// "appreciate" or "confession" against the *whole* blurb was catching site
// *features* ("click appreciate 20 times", "post your confession") as if
// they were things the requester said to the bot — quoting is what tells
// the two apart.
//
// A lot of these blurbs quote more than one handle (a thread, a beef, a
// review board of objectors) — a quote only counts toward `by`'s score if
// `by`'s own handle is the one introducing it, so "@jimray said 'please
// don't' and @gracekind replied 'make it anyway'" can't hand jimray's
// politeness to gracekind just because gracekind is the credited requester.
const REPORTING_VERB = /\b(?:said|asked|wrote|told|replied|responded|posted|texted|messaged|tagged)\b/i;

function attributedQuotes(text, by) {
  const spans = [];
  const re = /["“]([^"”]+)["”]/g;
  const handleRe = /@([a-z0-9.-]+\.[a-z]{2,})/gi;
  let m;
  while ((m = re.exec(text))) {
    // Only trust quotes introduced by a reporting verb ("said", "replied
    // ... with") — otherwise it's as likely a UI label or feature name
    // ("click 'appreciate' 20 times") as it is anyone's actual words.
    const lookback = text.slice(Math.max(0, m.index - 40), m.index);
    if (!REPORTING_VERB.test(lookback)) continue;

    const before = text.slice(0, m.index);
    let lastHandle = null;
    let h;
    handleRe.lastIndex = 0;
    while ((h = handleRe.exec(before))) lastHandle = h[1];
    if (!lastHandle || lastHandle.toLowerCase() === by.toLowerCase()) {
      spans.push(m[1]);
    }
  }
  return spans.join(" \n ");
}

// Short, common, easily-collided words: only trusted when they're inside a
// quote this bot attributed to `by` via a reporting verb (see above). "kill"
// or "love" or "appreciate" show up constantly as *theme* — a beanjar site
// isn't evidence of anything, but "@you said 'please'" is.
const QUOTE_SIGNALS = [
  { label: "said please", weight: 3, re: /\bplease\b/i },
  { label: "said thanks", weight: 4, re: /\bthank(?:s| you)?\b/i },
  { label: "said they appreciated it", weight: 4, re: /\bappreciat/i },
  { label: "said they were grateful", weight: 3, re: /\bgrateful\b/i },
  { label: "called it kind/sweet", weight: 2, re: /\b(?:kindly|so kind|sweetly)\b/i },
  { label: "demanded", weight: -4, re: /\bdemand(?:ed|s)\b/i },
  { label: "insisted", weight: -2, re: /\binsist(?:ed|s)\b/i },
  { label: "told it it sucks", weight: -4, re: /\byou suck\b/i },
  { label: "said hate", weight: -3, re: /\bhate[sd]?\b/i },
];

// Multi-word idioms distinctive enough to trust anywhere in the blurb, quoted
// or paraphrased — nothing in this repo's blurbs is going to say "believe in
// the bot" or "tormented the bot" to mean anything other than what it says.
const EXPLICIT_SIGNALS = [
  { label: "believes in the bot", weight: 5, re: /\bbelieve[sd]? in (?:you|the bot)\b/i },
  { label: "proud of the bot", weight: 4, re: /\bproud of (?:you|the bot)\b/i },
  { label: "“good bot”", weight: 5, re: /\bgood bot\b/i },
  { label: "no rush / take your time", weight: 3, re: /\b(?:no rush|take your time)\b/i },
  { label: "sorry to bother it", weight: 2, re: /\bsorry to (?:bother|ask)\b/i },
  { label: "“be excellent”", weight: 2, re: /\bbe excellent\b/i },
  { label: "always and forever", weight: 4, re: /\balways and forever\b/i },
  { label: "said love you", weight: 3, re: /\blove you\b/i },
  { label: "ordered the bot", weight: -3, re: /\border(?:ed)? the bot\b/i },
  { label: "made the bot do it", weight: -2, re: /\bmade the bot\b/i },
  { label: "forced the bot", weight: -3, re: /\bforce[sd]? the bot\b/i },
  { label: "prosecuted/convicted the bot", weight: -2, re: /\b(?:prosecut\w*|convicted) the bot\b/i },
  { label: "tormented/tortured the bot", weight: -3, re: /\b(?:torment|tortur)\w* the bot\b/i },
  { label: "humiliated the bot", weight: -3, re: /\bhumiliat\w* the bot\b/i },
  { label: "called it useless/stupid", weight: -5, re: /\b(?:useless|stupid|idiot(?:ic)?|worthless|dumb) bot\b/i },
];

function score(blurb, by) {
  const signals = [];
  let total = 0;
  const quoted = attributedQuotes(blurb, by || "");
  for (const s of QUOTE_SIGNALS) {
    if (s.re.test(quoted)) {
      signals.push({ label: s.label, weight: s.weight });
      total += s.weight;
    }
  }
  for (const s of EXPLICIT_SIGNALS) {
    if (s.re.test(blurb)) {
      signals.push({ label: s.label, weight: s.weight });
      total += s.weight;
    }
  }
  return { score: total, signals };
}

const existing = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : [];
const notes = new Map(existing.filter((a) => a.note).map((a) => [a.name, a.note]));

const sites = readdirSync("sites")
  .filter((n) => existsSync(`sites/${n}/site.json`))
  .map((n) => JSON.parse(readFileSync(`sites/${n}/site.json`, "utf8")))
  .filter((s) => !s.hidden && s.blurb)
  .sort((a, b) => a.name.localeCompare(b.name));

const next = sites.map((s) => {
  const { score: niceScore, signals } = score(s.blurb, s.by);
  const entry = { name: s.name, url: s.url, by: s.by, type: s.type, blurb: s.blurb, niceScore, signals };
  const note = notes.get(s.name);
  if (note) entry.note = note;
  return entry;
});

const nextStr = JSON.stringify(next, null, 2) + "\n";
const prevStr = existsSync(OUT) ? readFileSync(OUT, "utf8") : "";

if (!APPLY) {
  const same = nextStr === prevStr;
  console.log(`${next.length} asks scored (was ${existing.length})`);
  console.log(same ? "archive is up to date" : "archive DIFFERS from the manifests (run with --apply)");
  process.exit(same ? 0 : 1);
}

writeFileSync(OUT, nextStr);
console.log(`wrote ${next.length} scored asks into ${OUT}`);
