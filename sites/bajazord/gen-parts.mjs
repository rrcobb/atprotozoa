// Generates public/data/parts.json — the pool of real atprotozoa sites a
// megazord's three body parts get hashed from. A one-off snapshot, not a
// live fetch: sites are isolated Workers with no shared catalog endpoint
// (crossbreed hits this same wall — see its src/index.ts), so the honest fix
// is to bake a list at build time, same spirit as audit/build-gallery.mjs
// reading the manifests to regenerate the apex page. Re-run by hand
// (`node gen-parts.mjs`) whenever the roster should catch up to new sites.
//
//   node gen-parts.mjs   # writes ./public/data/parts.json
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";

const SITES_DIR = "../../sites";
const SELF = "bajazord";
// Meta/infra pages, not "a site" in the sense a megazord part should be —
// the bot's own home, its predecessor, and the games cluster's index page.
const EXCLUDE = new Set(["bajazord", "buildthis", "buildthis2", "games"]);

const names = readdirSync(SITES_DIR).filter(
  (n) => !EXCLUDE.has(n) && existsSync(`${SITES_DIR}/${n}/site.json`)
);

// A few blurbs use inline <em>/<code>/<b> for the gallery card's innerHTML;
// we render as plain textContent here, so strip tags before truncating.
const stripTags = (s) => s.replace(/<[^>]+>/g, "");

const parts = names
  .map((n) => JSON.parse(readFileSync(`${SITES_DIR}/${n}/site.json`, "utf8")))
  .filter((s) => !s.hidden && s.blurb && s.title && s.url)
  .map((s) => {
    const blurb = stripTags(s.blurb);
    return {
      name: s.name,
      title: s.title,
      type: s.type || "toy",
      blurb: blurb.length > 160 ? blurb.slice(0, 159).trimEnd() + "…" : blurb,
      url: s.url,
    };
  })
  .sort((a, b) => a.name.localeCompare(b.name));

writeFileSync("./public/data/parts.json", JSON.stringify(parts, null, 2) + "\n");
console.log(`wrote ${parts.length} parts to public/data/parts.json`);
