// Generates public/og.png — the Open Graph preview card for firstcontact.
// Same recipe as sites/backscroll/og-gen.mjs (copy, don't abstract): hand-drawn
// SVG at the canonical OG size, rasterised with @resvg/resvg-js.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// A horizontal timeline with small dots scattered along it, each one a
// different account's first-contact moment — dense near "now" on the right,
// sparse further back on the left, one dot picked out bright as "the first
// one of all."

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#0b1210", FG = "#eefaf3", DIM = "#6f9c8c", ACCENT = "#4ecba0";

let seed = 20260917;
function rand() {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
}

const lineY = 470;
const startX = 100, endX = 1100;
let dots = "";
const N = 40;
for (let i = 0; i < N; i++) {
  const t = Math.pow(i / (N - 1), 1.6); // sparse early, dense late
  const x = startX + t * (endX - startX) + (rand() - 0.5) * 8;
  const y = lineY + (rand() - 0.5) * 26;
  const r = 3 + rand() * 3.5;
  const op = (0.35 + t * 0.55).toFixed(2);
  dots += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" fill="${ACCENT}" opacity="${op}"/>\n  `;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="bg" cx="15%" cy="80%" r="90%">
      <stop offset="0%" stop-color="#123028"/>
      <stop offset="55%" stop-color="${BG}"/>
      <stop offset="100%" stop-color="#050807"/>
    </radialGradient>
    <radialGradient id="glow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="${ACCENT}" stop-opacity="0.95"/>
      <stop offset="45%" stop-color="${ACCENT}" stop-opacity="0.3"/>
      <stop offset="100%" stop-color="${ACCENT}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>

  <line x1="${startX}" y1="${lineY}" x2="${endX}" y2="${lineY}" stroke="${ACCENT}" stroke-width="1.5" opacity="0.25"/>
  ${dots}
  <circle cx="${startX}" cy="${lineY}" r="60" fill="url(#glow)"/>
  <circle cx="${startX}" cy="${lineY}" r="7" fill="${ACCENT}"/>

  <text x="64" y="180" font-family="JetBrains Mono" font-weight="800" font-size="72" fill="${FG}">firstcontact</text>
  <text x="64" y="222" font-family="JetBrains Mono" font-size="22" fill="${ACCENT}">every account you ever reached, in order</text>

  <text x="64" y="292" font-family="JetBrains Mono" font-size="19" fill="${DIM}">Downloads your whole repo, walks every</text>
  <text x="64" y="320" font-family="JetBrains Mono" font-size="19" fill="${DIM}">collection in it — likes, replies, quote</text>
  <text x="64" y="348" font-family="JetBrains Mono" font-size="19" fill="${DIM}">posts, reposts, follows, anything else —</text>
  <text x="64" y="376" font-family="JetBrains Mono" font-size="19" fill="${DIM}">and tables the earliest contact per account.</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${FG}">firstcontact.bisks.net</text>
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
