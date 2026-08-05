// Generates public/og.png — the Open Graph preview card for arachnid2027.
//
// Mirrors the page's report aesthetic: cream paper, ink text, a burnt-orange
// accent, and a miniature version of the "cumulative contact probability"
// chart from the essay. Rasterised with @resvg/resvg-js (pure native module,
// no system Chromium/fontconfig needed — the font is bundled in ./fonts).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract. Re-run by hand if you
// change the artwork. Adapted from sites/beanjar/og-gen.mjs.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#f6f1e6", INK = "#211c15", MUTED = "#6f6353", ACCENT = "#b5432f", LINE = "#ddd2ba";

// mini version of the essay's probability curve, plotted in a 380x220 box
const pts = [
  [0, 268], [38, 260.8], [76, 244], [114, 217.6], [152, 188.8],
  [190, 155.2], [228, 126.4], [266, 102.4], [304, 83.2], [342, 66.4], [380, 47.2],
].map(([x, y]) => [x, y - 40]); // shift so top sits ~7px in a 240-tall box

const chartX = 700, chartY = 300, chartW = 420, chartH = 240;
const poly = pts.map(([x, y]) => `${(chartX + x).toFixed(1)},${(chartY + y).toFixed(1)}`).join(" ");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect x="0" y="0" width="10" height="${H}" fill="${ACCENT}"/>

  <text x="70" y="120" font-family="JetBrains Mono" font-weight="700" font-size="16" letter-spacing="3" fill="${ACCENT}">A SCENARIO FORECAST</text>
  <text x="70" y="205" font-family="JetBrains Mono" font-weight="800" font-size="72" fill="${INK}">ARACHNID</text>
  <text x="70" y="280" font-family="JetBrains Mono" font-weight="800" font-size="72" fill="${INK}">2027</text>

  <text x="70" y="340" font-family="JetBrains Mono" font-size="19" fill="${MUTED}">when do the intergalactic energy</text>
  <text x="70" y="368" font-family="JetBrains Mono" font-size="19" fill="${MUTED}">spiders reach cislunar space?</text>

  <text x="70" y="430" font-family="JetBrains Mono" font-weight="700" font-size="18" fill="${ACCENT}">arachnid2027.bisks.net</text>

  <!-- mini chart -->
  <line x1="${chartX}" y1="${chartY + chartH}" x2="${chartX + chartW}" y2="${chartY + chartH}" stroke="${LINE}" stroke-width="2"/>
  <line x1="${chartX}" y1="${chartY}" x2="${chartX}" y2="${chartY + chartH}" stroke="${LINE}" stroke-width="2"/>
  <polyline points="${poly}" fill="none" stroke="${ACCENT}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="${chartX}" cy="${(chartY + pts[0][1]).toFixed(1)}" r="7" fill="${ACCENT}"/>
  <circle cx="${chartX + 380}" cy="${(chartY + pts[10][1]).toFixed(1)}" r="9" fill="${ACCENT}"/>
  <text x="${chartX}" y="${chartY + chartH + 34}" font-family="JetBrains Mono" font-size="15" fill="${MUTED}">Aug '26</text>
  <text x="${chartX + chartW}" y="${chartY + chartH + 34}" text-anchor="end" font-family="JetBrains Mono" font-size="15" fill="${MUTED}">Mar '29</text>
  <text x="${chartX}" y="${chartY - 16}" font-family="JetBrains Mono" font-size="15" fill="${MUTED}">P(cislunar contact)</text>
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
