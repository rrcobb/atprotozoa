// Generates public/og.png — the Open Graph preview card for gridlock.
//
// Hand-drawn SVG at the canonical OG size: a dusk highway with a row of
// bumper-to-bumper cars, each windshield a placeholder rider dot.
// Rasterised with @resvg/resvg-js (pure native module, no system Chromium/
// fontconfig needed — the font is bundled in ./fonts and loaded explicitly).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// you change the artwork. Adapted from sites/mootree/og-gen.mjs.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const SKY_TOP = "#241436", SKY_BOTTOM = "#4a2140";
const INK = "#f4f1ea", MUTED = "#b9b0c8", AMBER = "#ffb347", TAIL = "#ff5d5d", ACCENT = "#6fe3c9";
const ROAD = "#2b2438";

const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

// Bottom third: a road with a dashed centerline and a row of cars nose to
// tail, headlights and taillights glowing. Windshields carry generic rider
// dots (the real jam draws real avatars, client-side).
const roadY = 430;
const carY = roadY + 30;
const carW = 130, carH = 84, gap = 14;
const nCars = 7;
let cars = "";
for (let i = 0; i < nCars; i++) {
  const x = 40 + i * (carW + gap);
  const isYou = i === 2;
  const body = isYou ? AMBER : ["#c9c1d8", "#e5b8a8", "#9fd6c9", "#d8c98f"][i % 4];
  cars += `
    <g>
      <rect x="${x}" y="${carY}" width="${carW}" height="${carH}" rx="16" fill="${body}" opacity="${isYou ? 1 : 0.85}"/>
      <circle cx="${x + carW / 2}" cy="${carY + 32}" r="22" fill="#180f24" opacity="0.85"/>
      <circle cx="${x + carW / 2}" cy="${carY + 32}" r="22" fill="none" stroke="#ffffff55" stroke-width="3"/>
      <circle cx="${x + 18}" cy="${carY + carH - 6}" r="10" fill="#120a1c"/>
      <circle cx="${x + carW - 18}" cy="${carY + carH - 6}" r="10" fill="#120a1c"/>
      <rect x="${x - 4}" y="${carY + carH / 2 - 4}" width="6" height="10" rx="2" fill="${TAIL}" opacity="0.9"/>
    </g>`;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${SKY_TOP}"/>
      <stop offset="1" stop-color="${SKY_BOTTOM}"/>
    </linearGradient>
    <radialGradient id="sun" cx="82%" cy="18%" r="45%">
      <stop offset="0" stop-color="${AMBER}" stop-opacity="0.55"/>
      <stop offset="1" stop-color="${AMBER}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#sky)"/>
  <rect width="${W}" height="${H}" fill="url(#sun)"/>

  <text x="60" y="150" font-family="JetBrains Mono" font-weight="800" font-size="60" fill="${INK}">grid<tspan fill="${TAIL}">lock</tspan></text>
  <text x="62" y="192" font-family="JetBrains Mono" font-size="21" fill="${MUTED}">sit in traffic with your moots</text>

  <text x="62" y="252" font-family="JetBrains Mono" font-size="17" fill="${MUTED}">Type a handle, get stuck in a jam with your mutuals —</text>
  <text x="62" y="278" font-family="JetBrains Mono" font-size="17" fill="${MUTED}">pass notes, honk, spot it together. local to your browser.</text>

  <text x="62" y="336" font-family="JetBrains Mono" font-size="16" fill="${ACCENT}">breaker breaker · honk · spot it</text>

  <text x="62" y="600" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${AMBER}">gridlock.bisks.net</text>

  <rect x="0" y="${roadY}" width="${W}" height="${H - roadY}" fill="${ROAD}"/>
  <rect x="0" y="${roadY}" width="${W}" height="6" fill="#00000055"/>
  <rect x="0" y="${carY + carH + 22}" width="${W}" height="6" fill="#ffffff33"/>
  ${Array.from({ length: 16 }, (_, i) => `<rect x="${i * 76 + 10}" y="${carY + carH + 22}" width="34" height="6" fill="${SKY_BOTTOM}"/>`).join("")}
  ${cars}
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
