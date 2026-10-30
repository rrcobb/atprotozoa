// node og-gen.mjs — renders public/og.png (needs @resvg/resvg-js, e.g. from sites/receipts/node_modules)
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
const require = createRequire(new URL("../receipts/", import.meta.url));
const { Resvg } = require("@resvg/resvg-js");
const row = (y, c, i, t) => `<text x="90" y="${y}" font-size="34" fill="${c}">${i}</text><text x="140" y="${y}" font-size="34" fill="#e6edf3">${t}</text>`;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><rect width="1200" height="630" fill="#0d1117"/>
<g font-family="monospace"><text x="70" y="130" font-size="76" font-weight="bold" fill="#e6edf3">draftci</text>
<text x="70" y="190" font-size="32" fill="#8b949e">CI, but for drafting bluesky posts</text>
${row(290,"#3fb950","✓","lint: length  280/300")}${row(350,"#3fb950","✓","build: links")}${row(410,"#d29922","!","lint: tone  mostly ALL CAPS")}${row(470,"#f85149","✗","test: mentions resolve")}
<text x="70" y="570" font-size="30" fill="#58a6ff">draftci.bisks.net</text></g></svg>`;
writeFileSync(new URL("./public/og.png", import.meta.url), new Resvg(svg, { font: { loadSystemFonts: true } }).render().asPng());
