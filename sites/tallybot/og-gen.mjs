// Generates public/og.png — the Open Graph preview card for tallybot.
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
const ACCENT = "#7856ff", UP = "#17795a", DOWN = "#c0392b";

// A small mock leaderboard panel on the right — score pills in green/red to
// read as "leaderboard" at a glance, made-up names instead of real handles.
const rows = [
  { rank: 1, bar: 0.95, score: "+41", name: "the vibes" },
  { rank: 2, bar: 0.74, score: "+19", name: "printer jams" },
  { rank: 3, bar: 0.5, score: "+6", name: "mercury retrograde" },
  { rank: 4, bar: 0.3, score: "−3", name: "group chat silence" },
  { rank: 5, bar: 0.16, score: "−12", name: "surprise meetings" },
];

const panelX = 630, panelY = 90, panelW = 500, rowH = 82;
let rowsSvg = "";
rows.forEach((r, i) => {
  const y = panelY + i * rowH;
  const color = r.score.startsWith("−") ? DOWN : UP;
  rowsSvg += `
  <text x="${panelX}" y="${y + 34}" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${MUTED}">#${r.rank}</text>
  <text x="${panelX + 42}" y="${y + 34}" font-family="JetBrains Mono" font-weight="600" font-size="19" fill="${INK}">${r.name}</text>
  <text x="${panelX + panelW}" y="${y + 34}" text-anchor="end" font-family="JetBrains Mono" font-weight="800" font-size="24" fill="${color}">${r.score}</text>
  ${i > 0 ? `<line x1="${panelX}" y1="${y - 8}" x2="${panelX + panelW}" y2="${y - 8}" stroke="${FAINT}" stroke-width="2"/>` : ""}`;
});

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${BG}"/>

  <text x="64" y="140" font-family="JetBrains Mono" font-weight="800" font-size="62" fill="${INK}">tallybot</text>
  <text x="64" y="184" font-family="JetBrains Mono" font-size="21" fill="${MUTED}">a point, by <tspan fill="${ACCENT}">any name</tspan></text>

  <text x="64" y="260" font-family="JetBrains Mono" font-size="17" fill="${MUTED}">type anything, give it a</text>
  <text x="64" y="286" font-family="JetBrains Mono" font-size="17" fill="${MUTED}"><tspan fill="${UP}" font-weight="700">+1</tspan> or <tspan fill="${DOWN}" font-weight="700">−1</tspan>. or just post</text>
  <text x="64" y="312" font-family="JetBrains Mono" font-size="17" fill="${MUTED}">"&lt;name&gt; +1" anywhere on</text>
  <text x="64" y="338" font-family="JetBrains Mono" font-size="17" fill="${MUTED}">Bluesky — no sign-in needed.</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${ACCENT}">tallybot.bisks.net</text>

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
