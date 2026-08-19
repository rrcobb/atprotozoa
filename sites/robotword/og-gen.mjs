// Generates public/og.png — the Open Graph preview card for robotword.
//
// Mirrors the page's report aesthetic: cream paper, ink text, a brass
// accent, and a miniature version of the essay's precedent timeline.
// Rasterised with @resvg/resvg-js (pure native module, no system
// Chromium/fontconfig needed — the font is bundled in ./fonts).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract. Re-run by hand if you
// change the artwork. Adapted from sites/arachnid2027/og-gen.mjs.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#f6f1e6", INK = "#211c15", MUTED = "#6f6353", ACCENT = "#96591e", LINE = "#ddd2ba";

// mini version of the essay's precedent timeline, plotted in a 420x80 box
const chartX = 700, chartY = 420, chartW = 420;
const dots = [
  { x: 0, r: 7, label: "1739" },
  { x: 130, r: 7, label: "1818" },
  { x: 260, r: 7, label: "1913" },
  { x: 420, r: 10, label: "1921", ink: true },
];

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect x="0" y="0" width="10" height="${H}" fill="${ACCENT}"/>

  <text x="70" y="120" font-family="JetBrains Mono" font-weight="700" font-size="16" letter-spacing="3" fill="${ACCENT}">AN EXPLAINER</text>
  <text x="70" y="205" font-family="JetBrains Mono" font-weight="800" font-size="72" fill="${INK}">WHERE &quot;ROBOT&quot;</text>
  <text x="70" y="280" font-family="JetBrains Mono" font-weight="800" font-size="72" fill="${INK}">CAME FROM</text>

  <text x="70" y="340" font-family="JetBrains Mono" font-size="19" fill="${MUTED}">a 1921 Czech play, a brother's suggestion,</text>
  <text x="70" y="368" font-family="JetBrains Mono" font-size="19" fill="${MUTED}">and two centuries of golems and automata</text>

  <text x="70" y="430" font-family="JetBrains Mono" font-weight="700" font-size="18" fill="${ACCENT}">robotword.bisks.net</text>

  <!-- mini timeline -->
  <line x1="${chartX}" y1="${chartY}" x2="${chartX + chartW}" y2="${chartY}" stroke="${LINE}" stroke-width="2"/>
  ${dots.map(d => `<circle cx="${chartX + d.x}" cy="${chartY}" r="${d.r}" fill="${d.ink ? INK : ACCENT}"/>`).join("\n  ")}
  ${dots.map(d => `<text x="${chartX + d.x}" y="${chartY + 34}" text-anchor="middle" font-family="JetBrains Mono" font-size="15" fill="${MUTED}">${d.label}</text>`).join("\n  ")}
  <text x="${chartX}" y="${chartY - 20}" font-family="JetBrains Mono" font-size="15" fill="${MUTED}">precedents, laid end to end</text>
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
