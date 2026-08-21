// Generates public/og.png — the Open Graph preview card for tonolingo.
// Hand-drawn SVG at the canonical OG size, rasterised with @resvg/resvg-js.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200,
  H = 630;

const BG = "#f4faf9",
  BG2 = "#d8ece9",
  INK = "#17302d",
  DIM = "#6b8582",
  ACCENT = "#0e7c86",
  BORDER = "#d9e8e5",
  GREEN = "#58cc02";

// four little contour squiggles standing in for Mandarin's four tones
function contourPath(x, y, w, h, pts) {
  return pts
    .map((p, i) => {
      const px = x + p[0] * w;
      const py = y + (1 - (p[1] - 1) / 4) * h;
      return (i === 0 ? "M" : "L") + px.toFixed(1) + "," + py.toFixed(1);
    })
    .join(" ");
}
const contours = [
  [[0, 5], [1, 5]],
  [[0, 3], [1, 5]],
  [[0, 2], [0.5, 1], [1, 4]],
  [[0, 5], [1, 1]],
];

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow" cx="80%" cy="-10%" r="65%">
      <stop offset="0" stop-color="${BG2}"/>
      <stop offset="1" stop-color="${BG}"/>
    </radialGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  <rect x="24" y="24" width="${W - 48}" height="${H - 48}" fill="none" stroke="${ACCENT}" stroke-width="5"/>

  <text x="70" y="130" font-family="JetBrains Mono" font-weight="800" font-size="58" fill="${INK}">tonolingo</text>
  <text x="70" y="172" font-family="JetBrains Mono" font-weight="700" font-size="24" fill="${DIM}">duolingo for telling tones apart</text>

  <rect x="70" y="230" width="${W - 140}" height="150" rx="14" fill="#ffffff" stroke="${BORDER}" stroke-width="2"/>
  <text x="100" y="268" font-family="JetBrains Mono" font-size="18" fill="${DIM}" letter-spacing="1">LISTEN, THEN PICK THE TONE</text>
  <g fill="none" stroke="${ACCENT}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">
    <path d="${contourPath(110, 300, 210, 70, contours[0])}"/>
    <path d="${contourPath(370, 300, 210, 70, contours[1])}"/>
    <path d="${contourPath(630, 300, 210, 70, contours[2])}"/>
    <path d="${contourPath(890, 300, 210, 70, contours[3])}"/>
  </g>
  <g font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${INK}">
    <text x="110" y="360">ā</text>
    <text x="370" y="360">á</text>
    <text x="630" y="360">ǎ</text>
    <text x="890" y="360">à</text>
  </g>

  <g font-family="JetBrains Mono" font-weight="700" font-size="22">
    <text x="70" y="450" fill="${GREEN}">❤️ ❤️ ❤️</text>
    <text x="260" y="450" fill="${DIM}">3 hearts</text>
    <text x="450" y="450" fill="#ff9500">🔥 12</text>
    <text x="600" y="450" fill="${DIM}">day streak</text>
    <text x="760" y="450" fill="${ACCENT}">✦ 480 xp</text>
  </g>

  <text x="70" y="500" font-family="JetBrains Mono" font-size="20" fill="${DIM}">Mandarin · Vietnamese · Cantonese — synthesized live, no audio files</text>

  <text x="70" y="565" font-family="JetBrains Mono" font-weight="700" font-size="26" fill="${ACCENT}">tonolingo.bisks.net</text>
</svg>`;

const fontPaths = [fileURLToPath(new URL("./fonts/JetBrainsMono.ttf", import.meta.url))];

const r = new Resvg(svg, {
  fitTo: { mode: "width", value: W },
  font: { fontFiles: fontPaths, loadSystemFonts: false, defaultFontFamily: "JetBrains Mono" },
});
const png = r.render().asPng();
const out = new URL("./public/og.png", import.meta.url).pathname;
writeFileSync(out, png);
console.log("wrote", out, png.length, "bytes");
