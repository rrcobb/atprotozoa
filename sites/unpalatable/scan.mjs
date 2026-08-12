// Regenerates public/data/scores.json — the whole dataset behind unpalatable.
//
// Walks every sites/<name>/ in the repo, greps its manifest (and, for the one
// technical signal, its file list) for eight blunt signals of "a moderator
// would screenshot this," and scores it 0-8. No LLM in the loop, no semantic
// understanding — same spirit as griftindex's (sites/griftindex) six-signal
// realness scan and ngmi's/llmstance's keyword heuristics: dumb, transparent,
// and proud of it. A site about chickens scores the same whether the chickens
// are a punchline or a genuine felony; that's the joke, not a bug.
//
// Usage (from sites/unpalatable/):
//   node scan.mjs ../.. > public/data/scores.json

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.argv[2] || "../..";
const SITES_DIR = join(ROOT, "sites");
const SKIP = new Set(["node_modules", ".wrangler", "dist", "fonts"]);

function walkFiles(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (SKIP.has(e.name)) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walkFiles(p, out);
    else out.push(p);
  }
  return out;
}

const SIGNALS = [
  {
    key: "gambling",
    label: "gambling / wagering language",
    emoji: "\u{1F3B0}",
    test: (text) => /gambl|wager|\bbet(s|ting)?\b|casino|lottery|jackpot|parlay|\bodds\b/i.test(text),
  },
  {
    key: "crypto",
    label: "crypto / token / blockchain scheme",
    emoji: "\u{1FA99}",
    test: (text) => /crypto|blockchain|\btoken(s|omics)?\b|\bnft\b|\bcoin\b(?!flip)/i.test(text),
  },
  {
    key: "war",
    label: "war & weapons themed",
    emoji: "⚔️",
    test: (text) => /\bwar\b|weapon|missile|\bnuke\b|nuclear|\barmy\b|combat|warfare|battlefield/i.test(text),
  },
  {
    key: "surveillance",
    label: "tracking / surveillance of real people",
    emoji: "\u{1F441}️",
    test: (text) => /\btrack(s|ing|er)?\b|\bstalk|\bspy\b|\bscope\b|surveil|\bwatch(er|list)\b|\bmonitor/i.test(text),
  },
  {
    key: "money",
    label: "real money / credit-score dystopia",
    emoji: "\u{1F3E6}",
    test: (text) => /\bbank\b|\bstock(s)?\b|\binvest|derivative|credit score|social credit|\bloan\b/i.test(text),
  },
  {
    key: "oauth",
    label: "can post to your real account (OAuth)",
    emoji: "\u{1F511}",
    test: (_text, files) => files.some((f) => f.endsWith("client-metadata.json")),
  },
  {
    key: "chicken",
    label: "unspecified poultry activity",
    emoji: "\u{1F414}",
    test: (text) => /chicken|\bcluck|\bhen(house)?\b|poultry|\begg\b|\bcoop\b/i.test(text),
  },
  {
    key: "doom",
    label: "cult / occult / doom themed",
    emoji: "\u{1F480}",
    test: (text) => /\bcult\b|ritual|invocation|\bcurse|\bdemon|apocalyps|\bdoom\b|tabernacle|sacrific/i.test(text),
  },
];

const names = readdirSync(SITES_DIR, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .sort();

const results = [];
for (const name of names) {
  const dir = join(SITES_DIR, name);
  const sitejsonPath = join(dir, "site.json");
  if (!existsSync(sitejsonPath)) continue;
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(sitejsonPath, "utf8"));
  } catch {
    continue;
  }
  if (manifest.hidden) continue;
  // unpalatable doesn't grade itself: this whole page's copy necessarily
  // contains "gambling," "crypto," "surveillance," "cult" etc. as prose, and
  // its own OAuth-detector file would false-positive the oauth signal. A
  // self-score would measure the methodology explainer, not a real site.
  if (name === "unpalatable") continue;

  const text = [manifest.title, manifest.blurb, manifest.tag, manifest.type, name]
    .filter(Boolean)
    .join(" ");

  const files = walkFiles(dir);

  const hits = SIGNALS.filter((s) => s.test(text, files)).map((s) => s.key);
  results.push({
    name,
    title: manifest.title || name,
    url: manifest.url || `https://${name}.bisks.net/`,
    type: manifest.type || null,
    tag: manifest.tag || null,
    by: manifest.by || null,
    score: hits.length,
    hits,
  });
}

results.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

const out = {
  generatedAt: "2026-08-12",
  maxScore: SIGNALS.length,
  signals: SIGNALS.map(({ key, label, emoji }) => ({ key, label, emoji })),
  sites: results,
};

console.log(JSON.stringify(out, null, 2));
