// Generate the apex gallery's card list from the per-site site.json manifests.
//
// Replaces ONLY the <main>…</main> block in apex/public/index.html. Everything
// else on that page — the filter controls, the sort JS that reads data-type /
// data-src, the styles — is hand-written and stays untouched.
//
// The point is that a card can no longer drift from its site: cards exist
// because sites/<name>/site.json exists. A card for a site that was never built
// (the beyondbsky bug) becomes impossible, and a site with no card becomes
// visible as a missing manifest rather than silently absent from the front page.
//
// Usage:
//   node audit/build-gallery.mjs           # check: does the page match?
//   node audit/build-gallery.mjs --apply   # rewrite <main> from the manifests
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";

const APPLY = process.argv.includes("--apply");
const PAGE = "apex/public/index.html";

const esc = (s) =>
  String(s).replace(/&(?!(?:amp|lt|gt|quot|#39|rarr|mdash|hellip|nbsp);)/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const sites = readdirSync("sites")
  .filter((n) => existsSync(`sites/${n}/site.json`))
  .map((n) => JSON.parse(readFileSync(`sites/${n}/site.json`, "utf8")))
  .filter((s) => !s.hidden && s.blurb);

// Newest first where we know, then alphabetical — matches how the page read
// before, and keeps the order stable for sites with no build date.
sites.sort((a, b) => {
  if (a.builtAt && b.builtAt) return a.builtAt < b.builtAt ? 1 : -1;
  if (a.builtAt) return -1;
  if (b.builtAt) return 1;
  return a.name.localeCompare(b.name);
});

const cards = sites
  .map((s) => {
    const attrs = [
      `class="card"`,
      `href="${esc(s.url)}"`,
      `data-site="${esc(s.name)}"`,
      s.by ? `data-by="${esc(s.by)}"` : null,
      s.type ? `data-type="${esc(s.type)}"` : null,
      s.src ? `data-src="${esc(s.src)}"` : null,
      s.builtAt ? `data-built="${esc(s.builtAt)}"` : null,
    ]
      .filter(Boolean)
      .join(" ");
    const tag = s.tag ? ` <span class="tag">${esc(s.tag)}</span>` : "";
    return `        <a ${attrs}>
          <h2>${esc(s.title)}${tag}</h2>
          <p>
            ${esc(s.blurb)}
          </p>
        </a>`;
  })
  .join("\n");

const page = readFileSync(PAGE, "utf8");
const block = /(<main>\n)[\s\S]*?(\n      <\/main>)/;
if (!block.test(page)) {
  console.error("could not find the <main> block in " + PAGE + " — not touching it");
  process.exit(1);
}
const next = page.replace(block, (_m, open, close) => open + cards + close);

if (!APPLY) {
  const same = next === page;
  console.log(`${sites.length} cards from manifests`);
  console.log(same ? "gallery is up to date" : "gallery DIFFERS from the manifests (run with --apply)");
  process.exit(same ? 0 : 1);
}

writeFileSync(PAGE, next);
console.log(`wrote ${sites.length} cards into ${PAGE}`);
