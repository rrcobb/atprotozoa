// Find sites with a real Bluesky-handle <input> that don't carry the
// handle-typeahead.js drop-in (notes/41-drop-ins.md).
//
// This mechanizes a triage that's been done by hand three days running
// (sites/sidenote diary, 2026-09-19/20): grep every site for a handle-shaped
// input, then eyeball each hit against a handful of recurring false
// positives. Those false positives are now encoded below instead of
// re-derived:
//
//   - a site with its own bespoke typeahead file (e.g. listbot's
//     signin-typeahead.js) predates the drop-in and already does the job —
//     reported separately, not as a gap.
//   - an input with list="..." pointing at a local <datalist> already has
//     its own (if lesser) autocomplete — same treatment.
//   - a placeholder shaped like a URL/AT-URI/post link ("bsky.app/profile/",
//     "at://", "/post/") is usually a paste-a-post field, but several sites
//     (orrery, simcluster-atlas, coliseum) deliberately wire the drop-in to
//     a field that takes *either* a link or a bare handle — the typeahead
//     only suggests as you type, it never blocks a pasted URL. So these are
//     reported as their own bucket, not silently skipped: read the
//     placeholder to tell "link-or-handle" (wire it up) from "link only,
//     happens to show an example handle" (leave it).
//   - id/name containing "handle" is necessary but not sufficient: a field
//     can be named "handle" and still not take one (netris's
//     `id="handle-input" placeholder="name this run"`). When the placeholder
//     itself doesn't look handle-shaped, the hit is downgraded to
//     low-confidence for a human/agent to glance at rather than auto-listed
//     as a gap.
//
// The "mixed link-or-handle" bucket used to require a fresh by-hand read of
// every candidate every single day (2026-09-20, -21, -22 all did the exact
// same read and reached the exact same verdicts) — this mechanizes that read
// instead of repeating it. Every one of ashcan/claimstamp/nothoney/postcid/
// recordscope/skeetracker/snubbed's post-link fields throws a "that doesn't
// look like a link" (or recordscope's "couldn't parse that") error when the
// pasted text isn't URL/AT-URI-shaped, with no bare-handle fallback branch —
// contrast coliseum/orrery/simcluster-atlas, whose resolvers fall through to
// treating unrecognized text as a bare handle/DID instead of throwing. A
// candidate whose site JS contains that throw phrasing is downgraded from
// "needs a human read" to "confirmed link-only" (LINK_ONLY_SIGNAL below). A
// genuinely new link-or-handle field wouldn't trip this signal (it has no
// such throw to find), so it still surfaces in mixedLinkOrHandle for a read.
//
// One false-positive shape doesn't reduce to that signal at all: an in-page
// filter over handles already loaded into the DOM (threadriver's
// `#search-input`, placeholder "find a handle in this thread…") looks
// exactly like a live-search field by markup alone but isn't one — wiring
// network typeahead to it would suggest accounts that were never part of
// the thread. Confirmed by hand 2026-09-21 and again 2026-09-22; recorded in
// KNOWN_FALSE_POSITIVES below by site+id so it stops re-surfacing as a
// "likely gap" every day. If threadriver's search box changes, drop the
// entry and let it be re-evaluated.
//
// This is a finder, not a fixer — a human/agent should still skim anything
// that lands in `gaps` or `mixedLinkOrHandle` before wiring the drop-in in.
// It just stops re-asking about candidates already worked out by hand.
//
// Usage, from the repo root:
//   node audit/handle-typeahead-gaps.mjs         # human-readable report
//   node audit/handle-typeahead-gaps.mjs --json  # machine-readable
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(fileURLToPath(import.meta.url), "../..");
const json = process.argv.includes("--json");

const HANDLE_SIGNAL = /handle|bsky\.social|did.?or.?handle/i;
const URI_SHAPE = /at:\/\/|bsky\.app\/profile|\/post\/|\.did$/i;
const HANDLE_SHAPED_PLACEHOLDER = /handle|bsky\.social|@[a-z0-9-]+\.[a-z]/i;
// A resolver that throws this on non-link text and never falls back to
// treating the raw text as a bare handle — see the header comment above.
const LINK_ONLY_SIGNAL = /doesn't look like|couldn't (?:parse|find (?:a|the)\b.*\bin) that|isn't a valid|not a valid link|invalid (?:link|url|uri)/i;

// site name -> input id -> reason. Confirmed by hand, not by markup; see the
// header comment for why each one needs a human read instead of a regex.
const KNOWN_FALSE_POSITIVES = new Map([
  [
    "threadriver:search-input",
    "in-page filter over handles already loaded into the DOM, not a live network search (confirmed 2026-09-21/22)",
  ],
]);

function walkFiles(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(p, out);
    else out.push(p);
  }
  return out;
}

function siteDirs() {
  return readdirSync(path.join(REPO_ROOT, "sites"), { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
}

// Pull <input ...> tags (self-closed or not) out of an HTML string, with the
// line number they start on.
function findInputs(html) {
  const inputs = [];
  const re = /<input\b[^>]*>/gi;
  let m;
  while ((m = re.exec(html))) {
    const line = html.slice(0, m.index).split("\n").length;
    inputs.push({ tag: m[0], line });
  }
  return inputs;
}

function attr(tag, name) {
  const m = tag.match(new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, "i"));
  return m ? m[1] : "";
}

const results = {
  gaps: [],
  lowConfidence: [],
  alreadyCovered: [],
  mixedLinkOrHandle: [],
  confirmedLinkOnly: [],
  confirmedFalsePositive: [],
};

for (const site of siteDirs()) {
  const publicDir = path.join(REPO_ROOT, "sites", site, "public");
  if (!existsSync(publicDir)) continue;

  const files = walkFiles(publicDir);
  const hasDropIn = files.some((f) => path.basename(f) === "handle-typeahead.js");
  const bespoke = files.find(
    (f) => /typeahead/i.test(path.basename(f)) && path.basename(f) !== "handle-typeahead.js"
  );

  if (hasDropIn) continue; // already carries the drop-in, nothing to find here

  // Whether ANY js/html file in this site's public/ throws the "not a link"
  // error — computed once per site since the resolver usually lives in a
  // lib file separate from the html the input tag is in.
  const siteHasLinkOnlySignal = files
    .filter((f) => f.endsWith(".js") || f.endsWith(".html"))
    .some((f) => LINK_ONLY_SIGNAL.test(readFileSync(f, "utf8")));

  const htmlFiles = files.filter((f) => f.endsWith(".html"));
  for (const file of htmlFiles) {
    const html = readFileSync(file, "utf8");
    const rel = path.relative(REPO_ROOT, file);
    for (const { tag, line } of findInputs(html)) {
      const id = attr(tag, "id");
      const name = attr(tag, "name");
      const placeholder = attr(tag, "placeholder");
      const list = attr(tag, "list");

      if (!HANDLE_SIGNAL.test(id) && !HANDLE_SIGNAL.test(name) && !HANDLE_SIGNAL.test(placeholder)) {
        continue; // no handle-ish signal anywhere on this input at all
      }

      const hit = { site, file: rel, line, tag };

      const fp = KNOWN_FALSE_POSITIVES.get(`${site}:${id}`);
      if (fp) {
        results.confirmedFalsePositive.push({ ...hit, note: fp });
        continue;
      }
      if (bespoke) {
        results.alreadyCovered.push({ ...hit, note: `bespoke typeahead already present: ${path.relative(REPO_ROOT, bespoke)}` });
        continue;
      }
      if (list) {
        results.alreadyCovered.push({ ...hit, note: `input has list="${list}" — local datalist already wired` });
        continue;
      }
      if (URI_SHAPE.test(placeholder)) {
        if (siteHasLinkOnlySignal) {
          results.confirmedLinkOnly.push({ ...hit, note: "resolver throws on non-link text with no bare-handle fallback — link-only, not a gap" });
        } else {
          results.mixedLinkOrHandle.push({ ...hit, note: "placeholder looks URL/AT-URI-shaped — check whether it's link-only (skip) or link-or-handle like orrery/coliseum (wire it up)" });
        }
        continue;
      }
      if (!HANDLE_SHAPED_PLACEHOLDER.test(placeholder)) {
        results.lowConfidence.push({ ...hit, note: "id/name mention handle but placeholder doesn't look handle-shaped — verify by hand" });
        continue;
      }
      results.gaps.push(hit);
    }
  }
}

if (json) {
  console.log(JSON.stringify(results, null, 2));
} else {
  console.log(`Likely gaps (real handle input, no drop-in): ${results.gaps.length}`);
  for (const r of results.gaps) {
    console.log(`  ${r.site}  ${r.file}:${r.line}`);
    console.log(`    ${r.tag}`);
  }
  console.log(`\nLow confidence (verify by hand): ${results.lowConfidence.length}`);
  for (const r of results.lowConfidence) {
    console.log(`  ${r.site}  ${r.file}:${r.line} — ${r.note}`);
    console.log(`    ${r.tag}`);
  }
  console.log(`\nMixed link-or-handle fields (read the placeholder to decide): ${results.mixedLinkOrHandle.length}`);
  for (const r of results.mixedLinkOrHandle) {
    console.log(`  ${r.site}  ${r.file}:${r.line} — ${r.note}`);
  }
  console.log(`\nAlready covered by local autocomplete/bespoke typeahead: ${results.alreadyCovered.length}`);
  for (const r of results.alreadyCovered) {
    console.log(`  ${r.site}  ${r.file}:${r.line} — ${r.note}`);
  }
  console.log(`\nConfirmed link-only (skip, no action needed): ${results.confirmedLinkOnly.length}`);
  for (const r of results.confirmedLinkOnly) {
    console.log(`  ${r.site}  ${r.file}:${r.line} — ${r.note}`);
  }
  console.log(`\nConfirmed false positive (skip, verified by hand previously): ${results.confirmedFalsePositive.length}`);
  for (const r of results.confirmedFalsePositive) {
    console.log(`  ${r.site}  ${r.file}:${r.line} — ${r.note}`);
  }
}

process.exit(0);
