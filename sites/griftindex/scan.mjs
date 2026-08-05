// Regenerates public/data/scores.json — the whole dataset behind griftindex.
//
// Walks every sites/<name>/ in the repo, greps its source for six blunt
// signals of "this touches something real," and scores it 0-6. No LLM in the
// loop, no semantic understanding — same spirit as ngmi's and llmstance's
// keyword heuristics: dumb, transparent, and proud of it. That bluntness is
// why it misses things (westmeadow, for one, fetches another Worker's live
// event log at request time — genuinely live, but no regex here recognizes a
// generic cross-worker JSON fetch as a "real" signal). The point isn't
// perfect judgment, it's a receipts-first joke: six patterns anyone can read
// in this file, run against real source, sorted honestly.
//
// Usage (from sites/griftindex/):
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
    // scan.mjs is this detector's own source — it necessarily contains every
    // signal pattern as a literal string, so including it would make
    // griftindex trivially max its own score without doing any of the
    // things it grades other sites on. Excluded so its self-entry is honest.
    if (e.name === "scan.mjs") continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walkFiles(p, out);
    else if (/\.(ts|js|mjs|html|toml|json)$/.test(e.name)) out.push(p);
  }
  return out;
}

const SIGNALS = [
  {
    key: "appview",
    label: "live AppView fetch",
    emoji: "\u{1F310}",
    test: (text) => /public\.api\.bsky\.app|bsky\.social\/xrpc|\.api\.bsky\.app\/xrpc/.test(text),
  },
  {
    key: "firehose",
    label: "firehose / Jetstream",
    emoji: "\u{1F525}",
    test: (text) => /jetstream|wss:\/\//i.test(text),
  },
  {
    key: "car",
    label: "full repo CAR download",
    emoji: "\u{1F4E6}",
    test: (text) => /getRepo|\.car\b/.test(text),
  },
  {
    key: "oauth",
    label: "real atproto OAuth login",
    emoji: "\u{1F511}",
    test: (_text, files) => files.some((f) => f.endsWith("client-metadata.json")),
  },
  {
    key: "durable",
    label: "Durable Object (real server state)",
    emoji: "\u{1F5C4}",
    test: (text) => /durable_objects|DurableObject/.test(text),
  },
  {
    key: "storage",
    label: "KV / D1 / R2 persisted data",
    emoji: "\u{1F5C3}",
    test: (text) => /kv_namespaces|d1_databases|r2_buckets/.test(text),
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
  // griftindex doesn't grade itself: this whole page exists to explain the
  // six signal words, so its own copy necessarily contains "firehose",
  // "OAuth", "Durable Object" etc. as prose. A self-score would measure the
  // copy, not the code — noise, not signal. Left out rather than faked.
  if (name === "griftindex") continue;

  const files = walkFiles(dir);
  const text = files
    .map((f) => {
      try {
        return readFileSync(f, "utf8");
      } catch {
        return "";
      }
    })
    .join("\n");

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
  generatedAt: "2026-08-05",
  maxScore: SIGNALS.length,
  signals: SIGNALS.map(({ key, label, emoji }) => ({ key, label, emoji })),
  sites: results,
};

console.log(JSON.stringify(out, null, 2));
