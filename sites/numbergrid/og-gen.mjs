// Generates public/og.png — the static Open Graph preview card for the bare
// numbergrid.bisks.net link. Per-board share cards are drawn live,
// client-side, in public/app.js (drawCard); this is just the generic
// fallback. Hand-drawn SVG at the canonical OG size, rasterised with
// @resvg/resvg-js (pure native module, no system Chromium/fontconfig needed —
// the font is bundled in ./fonts and loaded explicitly).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// you change the artwork.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#151009", CARD = "#fbf1da", CARD2 = "#f4e6c6", LINE = "#d9c491";
const INK = "#2c2013", MUTED = "#c9b891", GOLD = "#c99a2e", ACCENT = "#c0392b";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// A 5x5 board: numbers 0..23 in order, with one open cell left (25th) to
// show the board mid-fill — same "not quite full" state a real board is
// usually in. Starts at 0 so the mex shown below (24) is the real mex of
// this exact set, not just decoration.
const filled = Array.from({ length: 24 }, (_, i) => i);
const side = 5;
const cardX = 620, cardY = 60, cardW = 520, cardH = 520;
const pad = 26, gap = 10;
const cell = (cardW - pad * 2 - gap * (side - 1)) / side;

let cells = "";
for (let i = 0; i < side * side; i++) {
  const r = Math.floor(i / side), c = i % side;
  const x = cardX + pad + c * (cell + gap);
  const y = cardY + pad + r * (cell + gap);
  if (i < filled.length) {
    cells += `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" rx="8" fill="${CARD2}"/>`;
    cells += `<text x="${x + cell / 2}" y="${y + cell / 2 + 8}" font-family="JetBrains Mono" font-weight="800" font-size="26" fill="${INK}" text-anchor="middle">${filled[i]}</text>`;
  } else {
    cells += `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" rx="8" fill="none" stroke="${LINE}" stroke-width="2" stroke-dasharray="4 5"/>`;
  }
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="15%" cy="-10%" r="60%">
      <stop offset="0" stop-color="#2c1f10"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${ACCENT}"/>
      <stop offset="1" stop-color="#e0685a"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>

  <text x="64" y="140" font-family="JetBrains Mono" font-weight="800" font-size="64" fill="url(#title)">numbergrid</text>
  <text x="66" y="196" font-family="JetBrains Mono" font-size="22" fill="${MUTED}">a bingo board for every number you've seen</text>

  <text x="66" y="290" font-family="JetBrains Mono" font-size="19" fill="${MUTED}">Sign in with atproto. Add a number.</text>
  <text x="66" y="322" font-family="JetBrains Mono" font-size="19" fill="${MUTED}">Watch the board grow into the next</text>
  <text x="66" y="354" font-family="JetBrains Mono" font-size="19" fill="${MUTED}">perfect square.</text>

  <rect x="60" y="410" width="420" height="3" fill="${LINE}" opacity="0.3"/>
  <text x="66" y="454" font-family="JetBrains Mono" font-weight="700" font-size="18" fill="${GOLD}">smallest number not seen yet:</text>
  <text x="66" y="486" font-family="JetBrains Mono" font-weight="800" font-size="30" fill="${GOLD}">24 &#183; 2 digits</text>

  <text x="66" y="560" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${GOLD}">numbergrid.bisks.net</text>

  ${cells}
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
