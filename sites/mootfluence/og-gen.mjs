// Generates public/og.png — the Open Graph preview card for mootfluence.
// Hand-drawn SVG at the canonical OG size, rasterised with @resvg/resvg-js
// (pure native module, no system Chromium/fontconfig needed — font is
// bundled in ./fonts and loaded explicitly). Copied from
// sites/influential25/og-gen.mjs.
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
const ACCENT = "#1083fe";

// A small mock ranked-moot-list panel on the right, echoing the on-page
// moot-list look — no real handles, just enough to read as "a ranking."
const rows = [
  { rank: 1, bar: 0.95, count: "9 noms", you: false },
  { rank: 2, bar: 0.78, count: "7 noms", you: true },
  { rank: 3, bar: 0.55, count: "5 noms", you: false },
  { rank: 4, bar: 0.3, count: "2 noms", you: false },
];

const panelX = 660, panelY = 120, panelW = 470, rowH = 82;
let rowsSvg = "";
rows.forEach((r, i) => {
  const y = panelY + i * rowH;
  const barMax = panelW - 170;
  const barColor = r.you ? ACCENT : FAINT;
  rowsSvg += `
  <text x="${panelX}" y="${y + 34}" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${r.you ? ACCENT : MUTED}">#${r.rank}</text>
  <rect x="${panelX + 44}" y="${y + 14}" width="${barMax}" height="20" rx="5" fill="${FAINT}"/>
  <rect x="${panelX + 44}" y="${y + 14}" width="${barMax * r.bar}" height="20" rx="5" fill="${barColor}" opacity="${r.you ? 1 : 0.6}"/>
  <text x="${panelX + panelW}" y="${y + 30}" text-anchor="end" font-family="JetBrains Mono" font-weight="800" font-size="20" fill="${r.you ? ACCENT : MUTED}">${r.count}${r.you ? " (you)" : ""}</text>
  ${i > 0 ? `<line x1="${panelX}" y1="${y - 8}" x2="${panelX + panelW}" y2="${y - 8}" stroke="${FAINT}" stroke-width="2"/>` : ""}`;
});

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${BG}"/>

  <text x="64" y="130" font-family="JetBrains Mono" font-weight="800" font-size="52" fill="${INK}">mootfluence</text>
  <text x="64" y="172" font-family="JetBrains Mono" font-size="20" fill="${MUTED}">influential25's board, <tspan fill="${ACCENT}">filtered to your moots</tspan></text>

  <text x="64" y="240" font-family="JetBrains Mono" font-size="17" fill="${MUTED}">where do you rank among the people</text>
  <text x="64" y="266" font-family="JetBrains Mono" font-size="17" fill="${MUTED}">who follow you back? then turn your</text>
  <text x="64" y="292" font-family="JetBrains Mono" font-size="17" fill="${MUTED}">top moots into a real starter pack.</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${ACCENT}">mootfluence.bisks.net</text>

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
