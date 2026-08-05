// Generates public/og.png — the Open Graph preview card for synastry.
// Hand-drawn SVG at the canonical OG size, echoing the live page's two
// facing chart-wheels-in-space look, rasterised with @resvg/resvg-js (pure
// native module, no system Chromium needed; this box has no fontconfig/
// system fonts either, so the font is bundled in ./fonts and loaded
// explicitly).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract. Adapted from
// sites/didscope/og-gen.mjs.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#0a0714", FG = "#f2ecff", DIM = "#a993d6", MUTED = "#7a6e96";
const A = "#6ef2c9", B = "#ff9f5f";
const HARMONIOUS = "#5b9bf0", TENSE = "#ef7d7d", NEUTRAL = "#e0a933";

function circlePoint(cx, cy, r, deg) {
  const rad = (deg * Math.PI) / 180;
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
}

const cA = [700, 320], cB = [960, 320], R = 210;
const anglesA = [15, 70, 130, 190, 240, 300];
const anglesB = [10, 60, 120, 170, 220, 280];
const dotsA = anglesA.map((d) => circlePoint(cA[0], cA[1], R - 25, d));
const dotsB = anglesB.map((d) => circlePoint(cB[0], cB[1], R - 25, d));

const links = [
  [0, 1, HARMONIOUS], [1, 3, TENSE], [2, 4, HARMONIOUS], [3, 0, NEUTRAL],
  [4, 2, TENSE], [5, 5, HARMONIOUS], [0, 4, TENSE], [2, 1, HARMONIOUS],
];
const linkSvg = links
  .map(([ia, ib, color]) => `<line x1="${dotsA[ia][0]}" y1="${dotsA[ia][1]}" x2="${dotsB[ib][0]}" y2="${dotsB[ib][1]}" stroke="${color}" stroke-width="1.6" stroke-opacity="0.65"/>`)
  .join("\n    ");
const dotsSvg = [...dotsA.map((p) => [p, A]), ...dotsB.map((p) => [p, B])]
  .map(([[x, y], c]) => `<circle cx="${x}" cy="${y}" r="6.5" fill="${c}"/>`)
  .join("\n    ");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="10%" cy="0%" r="60%">
      <stop offset="0" stop-color="#2a1a45"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="95%" cy="10%" r="55%">
      <stop offset="0" stop-color="#123244"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${A}"/>
      <stop offset="1" stop-color="${B}"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>
  <rect width="${W}" height="${H}" fill="url(#glow2)"/>

  <circle cx="120" cy="90" r="1.4" fill="${MUTED}"/>
  <circle cx="230" cy="150" r="1.1" fill="${MUTED}"/>
  <circle cx="60" cy="230" r="1.2" fill="${MUTED}"/>
  <circle cx="300" cy="60" r="1" fill="${MUTED}"/>
  <circle cx="1150" cy="560" r="1.3" fill="${MUTED}"/>
  <circle cx="1080" cy="600" r="1" fill="${MUTED}"/>

  <text x="64" y="150" font-family="JetBrains Mono" font-weight="800" font-size="72" fill="url(#title)">synastry</text>
  <text x="66" y="196" font-family="JetBrains Mono" font-size="22" fill="${DIM}">two birth charts, one 3D shape</text>
  <text x="66" y="228" font-family="JetBrains Mono" font-size="22" fill="${DIM}">see the geometry between two people</text>

  <text x="66" y="300" font-family="JetBrains Mono" font-size="16" fill="${MUTED}">enter two birthdays, times &amp; places —</text>
  <text x="66" y="326" font-family="JetBrains Mono" font-size="16" fill="${MUTED}">watch every synastry aspect strung</text>
  <text x="66" y="352" font-family="JetBrains Mono" font-size="16" fill="${MUTED}">between their two chart wheels.</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${A}">synastry.bisks.net</text>

  <circle cx="${cA[0]}" cy="${cA[1]}" r="${R}" fill="none" stroke="#4a3f66" stroke-width="1.5" opacity="0.8"/>
  <circle cx="${cB[0]}" cy="${cB[1]}" r="${R}" fill="none" stroke="#4a3f66" stroke-width="1.5" opacity="0.8"/>
  ${linkSvg}
  ${dotsSvg}
  <text x="${cA[0]}" y="${cA[1] - R - 22}" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${A}">person A</text>
  <text x="${cB[0]}" y="${cB[1] - R - 22}" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${B}">person B</text>
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
