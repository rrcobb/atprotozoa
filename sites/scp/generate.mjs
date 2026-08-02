// Generates the SCP site directory + one entry page per atprotozoa site.
//
// Reads sites/*/site.json (the same manifests that drive the apex gallery —
// see audit/build-gallery.mjs) and writes:
//   sites/scp/public/index.html            — the Site Directory
//   sites/scp/public/entries/scp-###.html  — one entry per site
//
// Every fact in an entry (title, url, requester, build date) comes straight
// off the site's own manifest. The Foundation framing — object class, hazard
// tags, procedure/discovery prose — is generated deterministically from a
// PRNG seeded on the site's name (same fnv1a + mulberry32 recipe as
// sites/bajazord/src/index.ts), so re-running this script is idempotent: the
// same catalog of sites always produces the same directory.
//
// Usage: node generate.mjs   (run from sites/scp/)
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from "node:fs";

const ROOT = "../../";
const OUT_DIR = "./public";
const ENTRIES_DIR = "./public/entries";

function hash32(str) {
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
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Manifests store blurbs pre-escaped for direct HTML embedding (same
// convention as audit/build-gallery.mjs) — the negative lookahead skips
// already-encoded entities so "D&amp;D" doesn't become "D&amp;amp;D".
function esc(s) {
  return String(s)
    .replace(/&(?!(?:amp|lt|gt|quot|#39|rarr|mdash|hellip|nbsp);)/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function pick(rand, arr) {
  return arr[Math.floor(rand() * arr.length)];
}

function pickN(rand, arr, n) {
  const pool = arr.slice();
  const out = [];
  for (let i = 0; i < n && pool.length; i++) {
    const idx = Math.floor(rand() * pool.length);
    out.push(pool.splice(idx, 1)[0]);
  }
  return out;
}

// --- load manifests -------------------------------------------------------

const names = readdirSync(ROOT + "sites").filter((n) =>
  existsSync(`${ROOT}sites/${n}/site.json`)
);

const all = names.map((n) => ({
  ...JSON.parse(readFileSync(`${ROOT}sites/${n}/site.json`, "utf8")),
  _dir: n,
}));

// scp.bisks.net cataloguing itself gets a hand-written slot, SCP-000, rather
// than a number in the normal alphabetical run — a numbered archive that
// numbers itself last is a much better bit than one that numbers itself
// wherever "scp" falls alphabetically.
const self = all.find((s) => s._dir === "scp");
const rest = all
  .filter((s) => s._dir !== "scp")
  .sort((a, b) => a._dir.localeCompare(b._dir));

const numbered = rest.map((s, i) => ({ ...s, _num: String(i + 1).padStart(3, "0") }));
if (self) numbered.push({ ...self, _num: "000" });

const byDir = new Map(numbered.map((s) => [s._dir, s]));

// --- Foundation flavor generation ------------------------------------------

const CLASS_LABELS = {
  safe: "Safe",
  euclid: "Euclid",
  keter: "Keter",
  thaumiel: "Thaumiel",
  neutralized: "Neutralized",
};

function classify(rand) {
  const r = rand();
  if (r < 0.42) return "safe";
  if (r < 0.8) return "euclid";
  if (r < 0.95) return "keter";
  return "thaumiel";
}

const TYPE_FLAVOR = {
  toy: "recreational anomaly",
  game: "recreational-hazard anomaly",
  tool: "utility-class anomaly",
  joke: "memetic anomaly",
  explainer: "informational anomaly",
  art: "aesthetic anomaly",
  archive: "archival anomaly",
  shop: "acquisition-class anomaly",
  chart: "instrumentation anomaly",
  tier: "taxonomic anomaly",
};
const TYPE_FLAVOR_DEFAULT = "unclassified anomaly";

const HAZARD_POOL = [
  "Cognitohazard",
  "Info-Hazard",
  "Memetic",
  "Sentient",
  "Digital",
  "Self-Replicating",
  "Grouped",
  "Extradimensional",
  "Temporal",
  "Ideological",
  "Auditory",
  "Visual",
  "Social",
  "Recreational",
];

const PROCEDURE_OPENERS = [
  (n, url) =>
    `SCP-${n} is contained at all times within the bisks.net subdomain lattice, reachable exclusively through the fixed address ${url}.`,
  (n, url) =>
    `Containment of SCP-${n} is passive: the anomaly is bounded by its own hostname and does not propagate beyond ${url} under any observed condition.`,
  (n, url) =>
    `SCP-${n} is confined to a single Cloudflare Worker instance addressed at ${url}. No physical containment chamber is required.`,
  (n, url) =>
    `Standard containment for SCP-${n} consists of restricting the anomaly's route to ${url} and monitoring for route drift.`,
];

const PROCEDURE_CLASS_CLAUSE = {
  safe: (n) =>
    `As a Safe-class object, SCP-${n} may be accessed by any individual possessing a standard web browser and an internet connection; no special clearance is required for observation.`,
  euclid: (n) =>
    `As a Euclid-class object, personnel are advised that SCP-${n}'s behavior is only partially predictable under repeat interaction; researchers should log anomalous outputs to the site's own Addendum before treating them as expected behavior.`,
  keter: (n) =>
    `As a Keter-class object, SCP-${n} requires active monitoring; any deviation from documented behavior is to be reported to the on-call Site Director immediately, addressed as @buildthis.bisks.net.`,
  thaumiel: (n) =>
    `As a Thaumiel-class object, SCP-${n} has been assessed as useful to Foundation operations and is retained in active service rather than mere containment.`,
  neutralized: (n) =>
    `SCP-${n} has since been assessed as Neutralized; the anomaly's effects, while still reachable at its listed address, no longer meet the threshold for active containment review.`,
};

const DESCRIPTION_OPENERS = [
  (title) => `SCP-{n}, catalogued internally as "${esc(title)},"`,
  (title) => `SCP-{n}, referred to by Foundation staff by its working name "${esc(title)},"`,
  (title) => `SCP-{n} — designated "${esc(title)}" in Foundation records —`,
];

const FIELD_NOTE_LEADS = [
  "Field notes recovered from the anomaly's own interface describe it thus:",
  "The anomaly's own landing page offers the following unprompted self-description:",
  "Interviewed via its public interface, SCP-{n} produced the following statement, transcribed verbatim:",
  "The clearest surviving account of the anomaly's function is its own front-page copy, reproduced below:",
];
const FIELD_NOTE_LEAD_NONE =
  "No field notes survive for this object; its interface offers no explanation of itself, and researchers have been unable to determine intent from behavior alone.";

const DISCOVERY_LEADS = [
  (by) => `SCP-{n} entered Foundation custody after being flagged by field asset @${esc(by)}, whose transmission initiated standard containment procedure.`,
  (by) => `Foundation awareness of SCP-{n} began with a tagged mention from the individual on record as @${esc(by)}.`,
  (by) => `SCP-{n} was brought to Foundation attention by @${esc(by)}, who is credited in the containment log as the requesting party.`,
];
const DISCOVERY_LEAD_UNKNOWN =
  "No requesting party is on record for SCP-{n}; the object's origin within Foundation custody predates current logging standards.";

const ADDENDUM_NOTES = {
  safe: (n) => `Addendum ${n}-A: Personnel are reminded that Safe classification describes containment difficulty, not triviality. Do not treat SCP-${n} as uninteresting on this basis alone.`,
  euclid: (n) => `Addendum ${n}-A: Euclid remains the Foundation's largest classification by volume. SCP-${n} is unremarkable within that population and is not flagged for expedited review.`,
  keter: (n) => `Addendum ${n}-A: SCP-${n}'s Keter designation reflects containment difficulty, not necessarily hostility. No harmful behavior has been documented at time of writing.`,
  thaumiel: (n) => `Addendum ${n}-A: SCP-${n} is one of a small number of objects the Foundation actively deploys rather than merely contains. Access is unrestricted; use is encouraged.`,
  neutralized: (n) => `Addendum ${n}-A: SCP-${n} remains reachable at its listed address despite Neutralized status. The Foundation has elected not to decommission the route.`,
};

function dateOf(site) {
  if (!site.builtAt) return null;
  return site.builtAt.slice(0, 10);
}

function typeFlavor(site) {
  return TYPE_FLAVOR[site.type] || TYPE_FLAVOR_DEFAULT;
}

// A plain vowel-letter check misreads "utility" (consonant "y" sound) as
// needing "an" — small enough set of flavor strings that a lookup beats a
// pronunciation library.
const ARTICLE_OVERRIDE = { "utility-class anomaly": "a" };
function article(word) {
  if (ARTICLE_OVERRIDE[word]) return ARTICLE_OVERRIDE[word];
  return /^[aeiou]/i.test(word) ? "an" : "a";
}

// Purely cosmetic redaction for sites hidden from the public gallery — the
// SCP framing of "clearance required" happens to line up exactly with what
// site.json already calls `hidden`, so this doubles as a small joke: the
// Foundation redacting things that were already hidden from the front page.
function redact(text, rand) {
  const words = text.split(" ");
  return words
    .map((w) => {
      if (w.length > 3 && rand() < 0.3) {
        return `<span class="redacted">${"█".repeat(Math.min(w.length, 10))}</span>`;
      }
      return esc(w);
    })
    .join(" ");
}

function buildEntry(site, num) {
  const rand = mulberry32(hash32(site._dir + "::scp"));
  const cls = classify(rand);
  const hazards = pickN(rand, HAZARD_POOL, 1 + Math.floor(rand() * 2));
  const title = site.title || site.name;
  const url = site.url || `https://${site.name}.bisks.net/`;
  const blurb = site.blurb;
  const by = site.by;
  const date = dateOf(site);
  const flavor = typeFlavor(site);

  const procedureOpen = pick(rand, PROCEDURE_OPENERS)(num, esc(url));
  const procedureClause = (PROCEDURE_CLASS_CLAUSE[cls] || PROCEDURE_CLASS_CLAUSE.euclid)(num);

  const descOpen = pick(rand, DESCRIPTION_OPENERS)(title).replace("{n}", num);
  const fieldNoteLead = blurb
    ? pick(rand, FIELD_NOTE_LEADS).replace("{n}", num)
    : FIELD_NOTE_LEAD_NONE.replace("{n}", num);
  const blurbText = blurb ? (site.hidden ? redact(blurb, rand) : esc(blurb)) : null;

  const discoveryLead = by
    ? pick(rand, DISCOVERY_LEADS)(by).replace("{n}", num)
    : DISCOVERY_LEAD_UNKNOWN.replace("{n}", num);
  const discoveryDate = date
    ? `First logged ${esc(date)}.`
    : "No discovery date is on record.";

  const addendum = (ADDENDUM_NOTES[cls] || ADDENDUM_NOTES.euclid)(num);

  const others = numbered.filter((s) => s._dir !== site._dir);
  const seeAlso = pickN(rand, others, Math.min(2, others.length));

  const idx = numbered.findIndex((s) => s._dir === site._dir);
  const prev = idx > 0 ? numbered[idx - 1] : null;
  const next = idx < numbered.length - 1 ? numbered[idx + 1] : null;

  const clearanceLine = site.hidden
    ? `<p class="terminal">Terminal access to this file is restricted to personnel with Level 3 clearance or higher. Public link is provided below for verification purposes only.</p>`
    : "";

  const shareText = `SCP-${num}: ${title} — ${url}`;
  const shareHref = `https://bsky.app/intent/compose?text=${encodeURIComponent(shareText)}`;

  const ogTitle = `SCP-${num}: ${title}`;
  const ogDesc = blurb
    ? blurb.length > 200
      ? blurb.slice(0, 197) + "..."
      : blurb
    : `Item #: SCP-${num} — Object Class: ${CLASS_LABELS[cls]}. Foundation entry for ${title}.`;
  const ogUrl = `https://scp.bisks.net/entries/scp-${num}`;

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>SCP-${num} — ${esc(title)}</title>
<meta name="description" content="${esc(ogDesc)}" />
<meta property="og:title" content="${esc(ogTitle)}" />
<meta property="og:description" content="${esc(ogDesc)}" />
<meta property="og:url" content="${ogUrl}" />
<meta property="og:type" content="article" />
<meta name="twitter:card" content="summary" />
<meta name="twitter:title" content="${esc(ogTitle)}" />
<meta name="twitter:description" content="${esc(ogDesc)}" />
<link rel="stylesheet" href="../style.css" />
</head>
<body>
<div class="wrap">
  <header class="masthead">
    <span class="stamp">SCP Foundation — Secure. Contain. Protozoa.</span>
    <h1><span class="item-no">Item #:</span> SCP-${num}</h1>
    <p class="byline">Object Class: <span class="badge ${cls}">${CLASS_LABELS[cls]}</span>
      &nbsp;·&nbsp; ${hazards.map((h) => `<span class="hazard">${esc(h)}</span>`).join(" ")}</p>
  </header>

  <section class="procedures">
    <h2>Special Containment Procedures</h2>
    <p>${procedureOpen} ${procedureClause}</p>
  </section>

  <section class="description">
    <h2>Description</h2>
    <p>${descOpen} classified as ${article(flavor)} ${esc(flavor)}, is reachable at <a href="${esc(url)}">${esc(url)}</a>.</p>
    ${
      blurbText
        ? `<p>${fieldNoteLead}</p><blockquote class="field-note">${blurbText}</blockquote>`
        : `<p>${fieldNoteLead}</p>`
    }
    ${clearanceLine}
  </section>

  <section class="discovery">
    <h2>Discovery Log</h2>
    <p>${discoveryLead} ${discoveryDate}</p>
  </section>

  <section class="addendum">
    <h2>Addendum</h2>
    <p>${addendum}</p>
    ${
      seeAlso.length
        ? `<p class="see-also">See also: ${seeAlso
            .map((s) => `<a href="scp-${s._num}">SCP-${s._num}</a> (${esc(s.title || s.name)})`)
            .join(", ")}.</p>`
        : ""
    }
  </section>

  <div class="share-row">
    <a class="share-bsky" href="${shareHref}" target="_blank" rel="noopener">Share on Bluesky</a>
    <a class="share-bsky" href="${esc(url)}" target="_blank" rel="noopener">Visit anomaly &rarr;</a>
  </div>

  <nav class="pager">
    <span>${prev ? `&larr; <a href="scp-${prev._num}">SCP-${prev._num}</a>` : ""}</span>
    <span><a href="../">Site Directory</a></span>
    <span>${next ? `<a href="scp-${next._num}">SCP-${next._num}</a> &rarr;` : ""}</span>
  </nav>

  <footer class="foundation-footer">This entry was generated from the site's own manifest. Nothing here is a real containment breach.</footer>
</div>
</body>
</html>
`;

  return { num, cls, hazards, title, url, blurb, html };
}

// --- build ------------------------------------------------------------

mkdirSync(ENTRIES_DIR, { recursive: true });

const built = numbered.map((site) => {
  const entry = buildEntry(site, site._num);
  writeFileSync(`${ENTRIES_DIR}/scp-${site._num}.html`, entry.html);
  return { ...entry, site };
});

built.sort((a, b) => (a.num === "000" ? -1 : b.num === "000" ? 1 : a.num.localeCompare(b.num)));

const classCounts = built.reduce((acc, e) => {
  acc[e.cls] = (acc[e.cls] || 0) + 1;
  return acc;
}, {});

const items = built
  .map((e) => {
    const excerpt = e.blurb
      ? (e.site.hidden ? "[DATA EXPUNGED — see entry for clearance notice]" : esc(e.blurb))
      : "No field notes on record.";
    return `      <li data-class="${e.cls}" data-search="${esc((e.title + " " + e.num + " " + (e.site.by || "")).toLowerCase())}">
        <a class="title-link" href="entries/scp-${e.num}">SCP-${e.num}: ${esc(e.title)}</a>
        <div class="meta">
          <span class="badge ${e.cls}">${CLASS_LABELS[e.cls]}</span>
          ${e.hazards.map((h) => `<span class="hazard">${esc(h)}</span>`).join(" ")}
        </div>
        <p class="excerpt">${excerpt}</p>
      </li>`;
  })
  .join("\n");

const classButtons = ["all", "safe", "euclid", "keter", "thaumiel"]
  .map(
    (c) =>
      `<button type="button" data-filter="${c}" class="${c === "all" ? "active" : ""}">${
        c === "all" ? "All" : CLASS_LABELS[c]
      }</button>`
  )
  .join("\n        ");

const indexShareText = `SCP Foundation Site Directory — ${built.length} bisks.net anomalies catalogued: https://scp.bisks.net/`;
const indexShareHref = `https://bsky.app/intent/compose?text=${encodeURIComponent(indexShareText)}`;

const indexHtml = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>SCP Foundation — bisks.net Site Directory</title>
<meta name="description" content="Every atprotozoa site catalogued as an SCP object: ${built.length} entries, object classes assigned, hazard tags, discovery logs." />
<meta property="og:title" content="SCP Foundation — bisks.net Site Directory" />
<meta property="og:description" content="Every atprotozoa site catalogued as an SCP object: ${built.length} entries, object classes assigned, hazard tags, discovery logs pulled from real build records." />
<meta property="og:url" content="https://scp.bisks.net/" />
<meta property="og:type" content="website" />
<meta name="twitter:card" content="summary" />
<meta name="twitter:title" content="SCP Foundation — bisks.net Site Directory" />
<meta name="twitter:description" content="Every atprotozoa site catalogued as an SCP object, ${built.length} entries and counting." />
<link rel="stylesheet" href="style.css" />
</head>
<body>
<div class="wrap">
  <header class="masthead">
    <span class="stamp">SCP Foundation — Secure. Contain. Protozoa.</span>
    <h1>Site Directory</h1>
    <p class="byline">bisks.net field office &middot; ${built.length} objects catalogued</p>
  </header>

  <p class="intro">
    A Foundation asset once described an unrelated bit as &ldquo;like a fanfic or an SCP.&rdquo;
    <a href="https://bsky.app/profile/norvid-studies.bsky.social">@norvid-studies.bsky.social</a>
    asked <a href="https://buildthis.bisks.net/">@buildthis</a> to make that literal: every site this
    bot and its collaborators have shipped, catalogued below as a proper containment file — object
    class, hazard tags, and a discovery log pulled from each site's actual build record. Nothing below
    is a real anomaly. Everything below is a real link.
  </p>

  <div class="controls">
    <input type="search" id="search" placeholder="search the directory&hellip;" autocomplete="off" />
    ${classButtons}
  </div>
  <p class="count" id="count">${built.length} objects shown</p>

  <ul class="directory" id="directory">
${items}
  </ul>

  <div class="share-row">
    <a class="share-bsky" href="${indexShareHref}" target="_blank" rel="noopener">Share this directory</a>
  </div>

  <footer class="foundation-footer">
    Generated from sites/*/site.json &middot; ${Object.entries(classCounts)
      .map(([c, n]) => `${n} ${CLASS_LABELS[c]}`)
      .join(" &middot; ")}
  </footer>
</div>
<script src="app.js"></script>
</body>
</html>
`;

writeFileSync(`${OUT_DIR}/index.html`, indexHtml);

console.log(`wrote ${built.length} entries + index.html`);
console.log(classCounts);
