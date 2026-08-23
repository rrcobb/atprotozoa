// Generates public/og.png — the static Open Graph preview for the bare
// keyglide.bisks.net link. Per-result share cards are generated live,
// client-side, in public/index.html (buildShareCard) — this is just the
// generic fallback card, hand-drawn SVG, rasterised with @resvg/resvg-js
// (no system fonts on this box, so the font is bundled in ./fonts).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#0a0f14", FG = "#dbe6ee", DIM = "#93a5b3", ACCENT = "#5eead4", ACCENT2 = "#a78bfa";
const CARD = "#121b24", BORDER = "#1f2c38", KEY = "#1a2733";

function miniKeyboard(x, y, keyW, keyH, gap) {
  const rows = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];
  let out = "";
  rows.forEach((row, ri) => {
    const offsetX = ri * (keyW * 0.5);
    for (let ci = 0; ci < row.length; ci++) {
      const kx = x + offsetX + ci * (keyW + gap);
      const ky = y + ri * (keyH + gap);
      out += `<rect x="${kx}" y="${ky}" width="${keyW}" height="${keyH}" rx="4" fill="${KEY}"/>`;
    }
  });
  return out;
}

const cardX = 620, cardY = 70, cardW = 516, cardH = 490;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow" cx="15%" cy="-10%" r="60%">
      <stop offset="0" stop-color="#14332f"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${ACCENT}"/>
      <stop offset="1" stop-color="${ACCENT2}"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>

  <text x="64" y="110" font-family="JetBrains Mono" font-weight="800" font-size="56" fill="url(#title)">keyglide</text>
  <text x="64" y="150" font-family="JetBrains Mono" font-size="19" fill="${DIM}">a typing test built from only</text>
  <text x="64" y="176" font-family="JetBrains Mono" font-size="19" fill="${DIM}">the smoothest words around</text>

  <text x="64" y="240" font-family="JetBrains Mono" font-size="16" fill="${DIM}">~2,000 common words, scored by real</text>
  <text x="64" y="264" font-family="JetBrains Mono" font-size="16" fill="${DIM}">keyboard geometry — hand alternation</text>
  <text x="64" y="288" font-family="JetBrains Mono" font-size="16" fill="${DIM}">and adjacent-key rolls. only the top</text>
  <text x="64" y="312" font-family="JetBrains Mono" font-size="16" fill="${DIM}">40% by flow score make the cut.</text>

  ${miniKeyboard(64, 420, 26, 26, 6)}

  <text x="64" y="${H - 46}" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${ACCENT}">keyglide.bisks.net</text>

  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="18" fill="${CARD}" stroke="${BORDER}" stroke-width="1.5"/>

  <text x="${cardX + cardW / 2}" y="${cardY + 170}" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="120" fill="${ACCENT}">87</text>
  <text x="${cardX + cardW / 2}" y="${cardY + 208}" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${DIM}">NET WPM</text>
  <text x="${cardX + cardW / 2}" y="${cardY + 280}" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="30" fill="${FG}">98% accuracy</text>
  <text x="${cardX + cardW / 2}" y="${cardY + 320}" text-anchor="middle" font-family="JetBrains Mono" font-size="20" fill="${FG}">30 words typed</text>

  <line x1="${cardX + 60}" y1="${cardY + 360}" x2="${cardX + cardW - 60}" y2="${cardY + 360}" stroke="${BORDER}" stroke-width="1"/>

  <text x="${cardX + cardW / 2}" y="${cardY + 410}" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${ACCENT2}">flow rating: silky</text>
  <text x="${cardX + cardW / 2}" y="${cardY + 438}" text-anchor="middle" font-family="JetBrains Mono" font-size="16" fill="${DIM}">(1.34 avg flow score)</text>
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
