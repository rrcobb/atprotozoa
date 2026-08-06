// Regenerates public/data/games.json — the Newtendo eShop's cartridge
// library — from the repo's own sites/*/site.json manifests (the same
// source apex/index.html's gallery is built from, see
// audit/build-gallery.mjs). A snapshot, not a live query: newtendo is a
// static site with no cross-site fetch at runtime, so re-run this by hand
// after new games ship to pick them up.
//
//   node sites/newtendo/gen-games.mjs
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";

const OUT = "sites/newtendo/public/data/games.json";

const games = readdirSync("sites")
  .filter((n) => existsSync(`sites/${n}/site.json`))
  .map((n) => JSON.parse(readFileSync(`sites/${n}/site.json`, "utf8")))
  .filter((s) => !s.hidden && s.type === "game" && s.url && s.title)
  .map((s) => ({
    name: s.name,
    url: s.url,
    title: s.title,
    blurb: s.blurb || "",
    by: s.by || null,
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

writeFileSync(OUT, JSON.stringify(games, null, 2) + "\n");
console.log(`wrote ${games.length} cartridges to ${OUT}`);
