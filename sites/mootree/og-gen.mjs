// Generates public/og.png — the Open Graph preview card for mootree, so a
// shared link auto-renders a picture of the tree in Bluesky / other
// unfurlers.
//
// Hand-drawn SVG at the canonical OG size: a trunk-and-branches tree of
// generic avatar dots grouped into generation rows (placeholder data, not a
// real user's tree — the real tree is rendered live, client-side, in
// public/index.html). Rasterised with @resvg/resvg-js (pure native module,
// no system Chromium/fontconfig needed — the font is bundled in ./fonts and
// loaded explicitly).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// you change the artwork. Adapted from sites/simcluster-guests/og-gen.mjs and
// sites/didscope/og-gen.mjs.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#0d130f", INK = "#f2f5f0", MUTED = "#9aa89f";
const TRUNK = "#a9835a", LEAF = "#4fae76", GOLD = "#ffd166";
const DOT = "#d8dcd6", DOT_FAINT = "#57605a";

const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

// Left side: wordmark + pitch. Right side: a little tree diagram — a trunk
// with three branch rows, dots hanging off each (grandparents / you /
// children), the "you" dot picked out in gold.
const treeX = 660;
const trunkX = treeX + 70;
const rows = [
  { y: 150, label: "GRANDPARENTS", n: 4, you: -1 },
  { y: 270, label: "PARENTS", n: 6, you: -1 },
  { y: 390, label: "YOUR GENERATION", n: 5, you: 2 },
  { y: 500, label: "CHILDREN", n: 7, you: -1 },
];
const topY = rows[0].y, botY = rows[rows.length - 1].y;

let branches = `<line x1="${trunkX}" y1="${topY}" x2="${trunkX}" y2="${botY}" stroke="${TRUNK}" stroke-width="4"/>`;
let dots = "";
let labels = "";
for (const row of rows) {
  const spread = 210;
  const startX = trunkX + 46;
  branches += `<line x1="${trunkX}" y1="${row.y}" x2="${startX}" y2="${row.y}" stroke="${TRUNK}" stroke-width="4"/>`;
  labels += `<text x="${startX + 8}" y="${row.y - 16}" font-family="JetBrains Mono" font-weight="700" font-size="13" letter-spacing="1.5" fill="${MUTED}">${esc(row.label)}</text>`;
  for (let i = 0; i < row.n; i++) {
    const x = startX + 20 + (i * spread) / (row.n - 1 || 1);
    const isYou = i === row.you;
    branches += `<line x1="${startX}" y1="${row.y}" x2="${x}" y2="${row.y}" stroke="${TRUNK}" stroke-width="2" opacity="0.6"/>`;
    dots += `<circle cx="${x}" cy="${row.y}" r="${isYou ? 11 : 8}" fill="${isYou ? GOLD : DOT}" opacity="${isYou ? 1 : 0.85}" stroke="${isYou ? "#00000030" : "none"}"/>`;
  }
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="10%" cy="0%" r="60%">
      <stop offset="0" stop-color="#173b26"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>

  <circle cx="78" cy="108" r="26" fill="${LEAF}" opacity="0.85"/>
  <circle cx="60" cy="122" r="18" fill="${LEAF}" opacity="0.85"/>
  <circle cx="98" cy="124" r="18" fill="${LEAF}" opacity="0.85"/>
  <rect x="72" y="128" width="10" height="26" rx="3" fill="${TRUNK}"/>
  <text x="64" y="228" font-family="JetBrains Mono" font-weight="800" font-size="52" fill="${INK}">moo<tspan fill="${LEAF}">tree</tspan></text>
  <text x="64" y="266" font-family="JetBrains Mono" font-size="20" fill="${MUTED}">a family tree of your bluesky moots</text>

  <text x="64" y="336" font-family="JetBrains Mono" font-size="17" fill="${MUTED}">Sign in and it sorts everyone you follow into</text>
  <text x="64" y="362" font-family="JetBrains Mono" font-size="17" fill="${MUTED}">generations, by account age — and orders each</text>
  <text x="64" y="388" font-family="JetBrains Mono" font-size="17" fill="${MUTED}">row by the order you actually followed them in.</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${LEAF}">mootree.bisks.net</text>

  ${branches}
  ${dots}
  ${labels}
</svg>`;

const fontPath = fileURLToPath(new URL("./fonts/JetBrainsMono.ttf", import.meta.url));
const r = new Resvg(svg, {
  fitTo: { mode: "width", value: W },
  font: { fontFiles: [fontPath], loadSystemFonts: false, defaultFontFamily: "JetBrains Mono" },
});
const png = r.render().asPng();
const out = new URL("./public/og.png", import.meta.url).pathname;
writeFileSync(out, png);
console.log("wrote", out, png.length, "bytes");
