// Generates public/og.png — the Open Graph preview card for Influential25.
// Hand-drawn SVG at the canonical OG size, rasterised with @resvg/resvg-js
// (pure native module, no system Chromium/fontconfig needed — font is
// bundled in ./fonts and loaded explicitly). Copied from sites/socialcredit/og-gen.mjs.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// you change the artwork.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#fffdf8", INK = "#14171a", MUTED = "#6b6b6b", FAINT = "#e2ddd0";
const ACCENT = "#1a5fd0", GOLD = "#c99a1a";

// A small mock top-5 panel on the right — rank + nomination-count bars, no
// real handles, just enough to read as "leaderboard" at a glance.
const rows = [
  { rank: 1, bar: 0.95, count: "38 noms" },
  { rank: 2, bar: 0.78, count: "31 noms" },
  { rank: 3, bar: 0.62, count: "24 noms" },
  { rank: 4, bar: 0.44, count: "17 noms" },
  { rank: 5, bar: 0.3, count: "12 noms" },
];

const panelX = 660, panelY = 90, panelW = 470, rowH = 82;
let rowsSvg = "";
rows.forEach((r, i) => {
  const y = panelY + i * rowH;
  const barMax = panelW - 170;
  rowsSvg += `
  <text x="${panelX}" y="${y + 34}" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${MUTED}">#${r.rank}</text>
  <rect x="${panelX + 44}" y="${y + 14}" width="${barMax}" height="20" rx="5" fill="${FAINT}"/>
  <rect x="${panelX + 44}" y="${y + 14}" width="${barMax * r.bar}" height="20" rx="5" fill="${GOLD}" opacity="0.85"/>
  <text x="${panelX + panelW}" y="${y + 30}" text-anchor="end" font-family="JetBrains Mono" font-weight="800" font-size="20" fill="${GOLD}">${r.count}</text>
  ${i > 0 ? `<line x1="${panelX}" y1="${y - 8}" x2="${panelX + panelW}" y2="${y - 8}" stroke="${FAINT}" stroke-width="2"/>` : ""}`;
});

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${BG}"/>

  <text x="64" y="130" font-family="JetBrains Mono" font-weight="800" font-size="52" fill="${INK}">Influential25</text>
  <text x="64" y="172" font-family="JetBrains Mono" font-size="20" fill="${MUTED}">the 25 <tspan fill="${ACCENT}">Most Influential</tspan></text>
  <text x="64" y="200" font-family="JetBrains Mono" font-size="20" fill="${MUTED}">Bluesky Posters of 2026</text>

  <text x="64" y="270" font-family="JetBrains Mono" font-size="17" fill="${MUTED}">sign in with Bluesky, search for anyone,</text>
  <text x="64" y="296" font-family="JetBrains Mono" font-size="17" fill="${MUTED}">nominate up to <tspan fill="${GOLD}" font-weight="700">10</tspan> accounts. ranked live,</text>
  <text x="64" y="322" font-family="JetBrains Mono" font-size="17" fill="${MUTED}">off the whole network, no gatekeeping.</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${ACCENT}">influential25.bisks.net</text>

  ${rowsSvg}
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
