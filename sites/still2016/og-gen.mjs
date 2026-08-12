// Generates public/og.png — the Open Graph preview card for still2016.
// Hand-drawn SVG at the canonical OG size, rasterised with @resvg/resvg-js
// (pure native module, no system Chromium / fontconfig needed — the font is
// bundled in ./fonts and loaded explicitly). Copied from
// sites/dosimeter/og-gen.mjs (that site's own lineage cites
// sites/thrashradar/og-gen.mjs, sites/thrashmeter/og-gen.mjs before that).
//
//   node og-gen.mjs   # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract. Re-run by hand if the
// artwork changes. (No emoji glyphs here — JetBrains Mono alone can't
// render them, so the clock motif from the page title is redrawn as plain
// shapes instead.)

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#f4ead9", FG = "#2e2118", DIM = "#8a7663";
const ACCENT = "#d4622f", ACCENT2 = "#2a7a6b";
const CARD = "#fffaf0", BORDER = "#e0cfad";

const cx = 940, cy = 340, r = 130;
// clock hands frozen at a "still 2016" reading
const hourAngle = -60, minuteAngle = 40;
function tip(deg, len) {
  const rad = (deg * Math.PI) / 180;
  return [cx + len * Math.sin(rad), cy - len * Math.cos(rad)];
}
const [hx, hy] = tip(hourAngle, r * 0.5);
const [mx, my] = tip(minuteAngle, r * 0.75);

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="8%" cy="-10%" r="60%">
      <stop offset="0" stop-color="#fbe4c4"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="95%" cy="0%" r="55%">
      <stop offset="0" stop-color="#dcefe6"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${ACCENT}"/>
      <stop offset="1" stop-color="${ACCENT2}"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>
  <rect width="${W}" height="${H}" fill="url(#glow2)"/>

  <text x="64" y="150" font-family="JetBrains Mono" font-weight="800" font-size="64" fill="url(#title)">still2016</text>
  <text x="64" y="200" font-family="JetBrains Mono" font-size="22" fill="${DIM}">the bsky firehose, filtered for</text>
  <text x="64" y="230" font-family="JetBrains Mono" font-size="22" fill="${DIM}">the last ten years</text>

  <text x="64" y="310" font-family="JetBrains Mono" font-size="18" fill="${DIM}">No COVID. No ChatGPT. No Elon</text>
  <text x="64" y="336" font-family="JetBrains Mono" font-size="18" fill="${DIM}">buying Twitter. No explicit later</text>
  <text x="64" y="362" font-family="JetBrains Mono" font-size="18" fill="${DIM}">year. What's left could still be 2016.</text>

  <text x="64" y="480" font-family="JetBrains Mono" font-weight="800" font-size="34" fill="${ACCENT}">"just made coffee and it's</text>
  <text x="64" y="518" font-family="JetBrains Mono" font-weight="800" font-size="34" fill="${ACCENT}">actually a nice day out"</text>
  <text x="64" y="552" font-family="JetBrains Mono" font-size="17" fill="${DIM}">a plausible live example</text>

  <text x="64" y="600" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${ACCENT2}">still2016.bisks.net</text>

  <rect x="760" y="200" width="320" height="280" rx="18" fill="${CARD}" stroke="${BORDER}" stroke-width="1.5"/>
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${ACCENT2}" stroke-width="8" opacity="0.55"/>
  <circle cx="${cx}" cy="${cy - r}" r="5" fill="${ACCENT}"/>
  <circle cx="${cx}" cy="${cy + r}" r="5" fill="${ACCENT}"/>
  <circle cx="${cx - r}" cy="${cy}" r="5" fill="${ACCENT}"/>
  <circle cx="${cx + r}" cy="${cy}" r="5" fill="${ACCENT}"/>
  <line x1="${cx}" y1="${cy}" x2="${hx.toFixed(1)}" y2="${hy.toFixed(1)}" stroke="${FG}" stroke-width="7" stroke-linecap="round"/>
  <line x1="${cx}" y1="${cy}" x2="${mx.toFixed(1)}" y2="${my.toFixed(1)}" stroke="${FG}" stroke-width="5" stroke-linecap="round"/>
  <circle cx="${cx}" cy="${cy}" r="9" fill="${ACCENT}"/>
  <text x="${cx}" y="${cy + r + 55}" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="16" letter-spacing="2" fill="${ACCENT2}">2016</text>
</svg>`;

const fontPath = fileURLToPath(new URL("./fonts/JetBrainsMono.ttf", import.meta.url));
const r_ = new Resvg(svg, {
  fitTo: { mode: "width", value: W },
  font: { fontFiles: [fontPath], loadSystemFonts: false, defaultFontFamily: "JetBrains Mono" },
});
const png = r_.render().asPng();
const out = new URL("./public/og.png", import.meta.url).pathname;
writeFileSync(out, png);
console.log("wrote", out, png.length, "bytes");
