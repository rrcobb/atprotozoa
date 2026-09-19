// Generates public/og.png — the Open Graph preview card for ratcop.
// Hand-drawn SVG at the canonical OG size: a sample translation panel.
// Rasterised with @resvg/resvg-js (pure native module, no system Chromium
// needed — this box has no fontconfig/system fonts either, so the font is
// bundled in ./fonts and loaded explicitly).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract. Adapted from
// sites/xrate/og-gen.mjs.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#0d1117", PANEL = "#151b23", PANEL2 = "#1c2430", BORDER = "#2a3441", FG = "#e6edf3", DIM = "#8b96a5";
const ACCENT = "#56d2c2", ACCENT2 = "#ff8a5c";

const rows = [
  ["prior", "working theory"],
  ["akrasia", "repeat call, same address"],
  ["unihemispheric sleep training", "working a double, no choice"],
];

const rowSvg = rows
  .map((r, i) => {
    const y = 300 + i * 78;
    return `<line x1="600" y1="${y + 58}" x2="1140" y2="${y + 58}" stroke="${BORDER}" stroke-width="1"/>
    <text x="620" y="${y + 8}" font-family="JetBrains Mono" font-size="18" fill="${DIM}">${r[0]}</text>
    <text x="620" y="${y + 34}" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${ACCENT}">→ ${r[1]}</text>`;
  })
  .join("\n    ");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="15%" cy="0%" r="55%">
      <stop offset="0" stop-color="#123a34"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${ACCENT}"/>
      <stop offset="1" stop-color="${ACCENT2}"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>

  <!-- left: wordmark + pitch -->
  <text x="64" y="150" font-family="JetBrains Mono" font-weight="800" font-size="66" fill="url(#title)">ratcop</text>
  <text x="64" y="200" font-family="JetBrains Mono" font-size="20" fill="${DIM}">rationalist</text>
  <text x="64" y="228" font-family="JetBrains Mono" font-size="20" fill="${DIM}">&lt;-&gt; <tspan fill="${ACCENT2}">cop speak</tspan></text>

  <text x="64" y="300" font-family="JetBrains Mono" font-size="16" fill="${DIM}">yudisms, rationalist jargon, and</text>
  <text x="64" y="326" font-family="JetBrains Mono" font-size="16" fill="${DIM}">documented zizian dialect, translated</text>
  <text x="64" y="352" font-family="JetBrains Mono" font-size="16" fill="${DIM}">word for word into cop speak.</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="19" fill="${ACCENT}">ratcop.bisks.net</text>

  <!-- right: sample translations panel -->
  <rect x="560" y="40" width="600" height="550" rx="16" fill="${PANEL}" stroke="${BORDER}" stroke-width="1.5"/>
  <rect x="600" y="80" width="520" height="180" rx="12" fill="${PANEL2}" stroke="${BORDER}" stroke-width="1"/>
  <text x="622" y="130" font-family="JetBrains Mono" font-size="18" fill="${DIM}">Bayesian update</text>
  <text x="622" y="168" font-family="JetBrains Mono" font-weight="800" font-size="26" fill="${ACCENT}">→ new intel just came in</text>
  ${rowSvg}
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
