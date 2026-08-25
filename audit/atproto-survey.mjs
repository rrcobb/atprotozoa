// Survey what atproto APIs each site actually calls, from the source on disk.
//
// Built for sites/belvedere (a status page @zzstoatzzdevlog.bsky.social asked
// for: "a field of lil dots... escher aesthetic" showing typeahead support
// across every site the bot has built, extended per @bisks.net's follow-up
// to survey atproto tool usage more broadly, not just typeahead).
//
// Walks every sites/<name>/{src,public} tree, greps source files (not
// generated data/*.json, not markdown) for known atproto call patterns, and
// writes one JSON record per site to sites/belvedere/public/data/survey.json.
//
// Usage:
//   node audit/atproto-survey.mjs               # write the survey
//   node audit/atproto-survey.mjs --print-stats  # also print a tag histogram
import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from "node:fs";
import { join, extname } from "node:path";

const SITES_DIR = "sites";
const OUT = "sites/belvedere/public/data/survey.json";
const SCAN_EXTS = new Set([".js", ".mjs", ".ts", ".tsx", ".html"]);
// Generated/data artifacts and docs that quote API names in prose rather than
// calling them — would otherwise read as false positives.
const SKIP_PATH_PARTS = ["/data/", "/node_modules/", "/.git/"];
const SKIP_FILES = new Set(["ARCHITECTURE.md", "INSTRUCTIONS.md"]);

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    const p = join(dir, entry);
    if (SKIP_PATH_PARTS.some((part) => (p + "/").includes(part))) continue;
    let st;
    try {
      st = statSync(p);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      walk(p, out);
    } else if (SCAN_EXTS.has(extname(p)) && !SKIP_FILES.has(entry)) {
      out.push(p);
    }
  }
  return out;
}

// Each tag: id, label, a regex tested against concatenated source, and a
// `tier` used to pick one "primary" tag per site for the dot's fill color.
// Higher tier number = richer/rarer atproto integration; the highest tier
// present wins as primary. Tier 0 is reserved for "none detected".
const TAGS = [
  {
    id: "oauth",
    label: "atproto OAuth login",
    tier: 5,
    re: /BrowserOAuthClient|@atproto\/oauth-client|client-metadata\.json/,
  },
  {
    id: "direct-write",
    label: "writes records (createRecord/putRecord/applyWrites)",
    tier: 4,
    re: /\b(?:com\.atproto\.repo\.(?:createRecord|putRecord|applyWrites)|createRecord|putRecord)\b/,
  },
  {
    id: "jetstream",
    label: "live Jetstream firehose subscription",
    tier: 4,
    re: /jetstream\d?\.(?:us-east|us-west)\.bsky\.network|wantedCollections/i,
  },
  {
    id: "bulk-car",
    label: "bulk repo download (sync.getRepo / CAR parse)",
    tier: 3,
    re: /com\.atproto\.sync\.getRepo|\bgetRepo\b|parseCar|readCar\b/,
  },
  {
    id: "paginated-list",
    label: "paginated repo.listRecords walk",
    tier: 2,
    re: /com\.atproto\.repo\.listRecords|\blistRecords\b/,
  },
  {
    id: "author-feed",
    label: "getAuthorFeed",
    tier: 2,
    re: /getAuthorFeed/,
  },
  {
    id: "graph",
    label: "getFollows / getFollowers",
    tier: 2,
    re: /getFollows\b|getFollowers\b/,
  },
  {
    id: "profile-read",
    label: "getProfile(s)",
    tier: 1,
    re: /getProfile\b|getProfiles\b/,
  },
  {
    id: "typeahead-own",
    label: "own-AppView actor search typeahead",
    tier: 1,
    re: /public\.api\.bsky\.app\/xrpc\/app\.bsky\.actor\.searchActors/,
  },
  {
    id: "typeahead-thirdparty",
    label: "third-party typeahead.waow.tech",
    tier: 1,
    re: /typeahead\.waow\.tech/,
  },
  {
    id: "plc-directory",
    label: "plc.directory / handle resolution",
    tier: 1,
    re: /plc\.directory|resolveHandle|\.well-known\/atproto-did/,
  },
  {
    id: "custom-lexicon",
    label: "custom lexicon definitions",
    tier: 1,
    re: /\/lexicons\//,
  },
];

// A plain (non-typeahead) handle/DID input field — used to tell "has a login
// field but no typeahead" apart from "has no such field at all".
const HANDLE_FIELD_RE =
  /(?:name|id|placeholder)\s*=\s*["'][^"']*(?:handle|actor|did)[^"']*["']/i;

const siteNames = readdirSync(SITES_DIR).filter((n) => {
  try {
    return statSync(join(SITES_DIR, n)).isDirectory();
  } catch {
    return false;
  }
});

const results = [];
const histogram = {};

for (const name of siteNames) {
  const siteDir = join(SITES_DIR, name);
  const siteJsonPath = join(siteDir, "site.json");
  if (!existsSync(siteJsonPath)) continue; // not a real published site

  const files = [
    ...walk(join(siteDir, "src")),
    ...walk(join(siteDir, "public")),
  ];

  let source = "";
  let hasHandleField = false;
  for (const f of files) {
    let text;
    try {
      text = readFileSync(f, "utf8");
    } catch {
      continue;
    }
    source += "\n" + text;
    if (!hasHandleField && HANDLE_FIELD_RE.test(text)) hasHandleField = true;
  }

  const foundTags = TAGS.filter((t) => t.re.test(source)).map((t) => t.id);
  for (const id of foundTags) histogram[id] = (histogram[id] || 0) + 1;

  let primary = "none";
  let primaryTier = 0;
  for (const id of foundTags) {
    const t = TAGS.find((x) => x.id === id);
    if (t.tier > primaryTier) {
      primaryTier = t.tier;
      primary = t.id;
    }
  }

  let typeahead;
  if (foundTags.includes("typeahead-thirdparty")) typeahead = "thirdparty";
  else if (foundTags.includes("typeahead-own")) typeahead = "own-appview";
  else if (hasHandleField) typeahead = "plain-field";
  else typeahead = "none";

  let site = {};
  try {
    site = JSON.parse(readFileSync(siteJsonPath, "utf8"));
  } catch {
    // leave as {}
  }

  results.push({
    name,
    title: site.title || name,
    url: site.url || `https://${name}.bisks.net/`,
    type: site.type || null,
    tags: foundTags,
    primary,
    typeahead,
    fileCount: files.length,
  });
}

results.sort((a, b) => a.name.localeCompare(b.name));

const out = {
  generatedFrom: "audit/atproto-survey.mjs",
  siteCount: results.length,
  tagLegend: TAGS.map(({ id, label, tier }) => ({ id, label, tier })),
  sites: results,
};

writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n");
console.log(`wrote ${OUT} — ${results.length} sites surveyed`);

if (process.argv.includes("--print-stats")) {
  console.log("\ntag histogram:");
  for (const [id, count] of Object.entries(histogram).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${id.padEnd(22)} ${count}`);
  }
  const typeaheadCounts = {};
  for (const r of results) typeaheadCounts[r.typeahead] = (typeaheadCounts[r.typeahead] || 0) + 1;
  console.log("\ntypeahead status:");
  for (const [k, v] of Object.entries(typeaheadCounts)) console.log(`  ${k.padEnd(14)} ${v}`);
  const primaryCounts = {};
  for (const r of results) primaryCounts[r.primary] = (primaryCounts[r.primary] || 0) + 1;
  console.log("\nprimary tier:");
  for (const [k, v] of Object.entries(primaryCounts).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(22)} ${v}`);
}
