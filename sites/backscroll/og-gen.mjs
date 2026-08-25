// Generates public/og.png — the Open Graph preview card for backscroll. Same
// recipe as sites/westmoot/og-gen.mjs (copy, don't abstract): hand-drawn SVG
// at the canonical OG size, rasterised with @resvg/resvg-js.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// A vertical scroll of small marks unspooling from one bright point near the
// bottom (the oldest post) up toward a fading trail at the top (now) — "roll
// it all the way back, then read forward."

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#14100c", FG = "#f2e9dc", DIM = "#9a8468", ACCENT = "#e0a95a";

let seed = 20260825;
function rand() {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
}

const originX = 940, originY = 540;
let marks = "";
let lines = "";
const N = 46;
let px = originX, py = originY;
for (let i = 0; i < N; i++) {
  const t = i / N;
  const x = originX + (rand() - 0.5) * 60 * (1 - t * 0.4);
  const y = originY - t * 470;
  const op = (0.9 - t * 0.75).toFixed(2);
  const r = (5 - t * 3).toFixed(1);
  lines += `<line x1="${px.toFixed(1)}" y1="${py.toFixed(1)}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="${ACCENT}" stroke-width="1.5" opacity="${(op * 0.5).toFixed(2)}"/>\n  `;
  marks += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r}" fill="${ACCENT}" opacity="${op}"/>\n  `;
  px = x; py = y;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="bg" cx="75%" cy="85%" r="90%">
      <stop offset="0%" stop-color="#241c12"/>
      <stop offset="55%" stop-color="${BG}"/>
      <stop offset="100%" stop-color="#080604"/>
    </radialGradient>
    <radialGradient id="glow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="${ACCENT}" stop-opacity="0.95"/>
      <stop offset="45%" stop-color="${ACCENT}" stop-opacity="0.3"/>
      <stop offset="100%" stop-color="${ACCENT}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>

  ${lines}
  ${marks}
  <circle cx="${originX}" cy="${originY}" r="80" fill="url(#glow)"/>
  <circle cx="${originX}" cy="${originY}" r="8" fill="${ACCENT}"/>

  <text x="64" y="188" font-family="JetBrains Mono" font-weight="800" font-size="72" fill="${FG}">backscroll</text>
  <text x="64" y="230" font-family="JetBrains Mono" font-size="22" fill="${ACCENT}">your moots, oldest post first</text>

  <text x="64" y="300" font-family="JetBrains Mono" font-size="19" fill="${DIM}">Every moot's entire post history, walked</text>
  <text x="64" y="328" font-family="JetBrains Mono" font-size="19" fill="${DIM}">all the way back to its last page and</text>
  <text x="64" y="356" font-family="JetBrains Mono" font-size="19" fill="${DIM}">merged into one scroll — rewound to the</text>
  <text x="64" y="384" font-family="JetBrains Mono" font-size="19" fill="${DIM}">start, read forward from there.</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${FG}">backscroll.bisks.net</text>
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
