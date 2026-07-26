// Generates public/og.png — the Open Graph preview card for moottris, so a
// shared link auto-renders a picture of the game in Bluesky / other
// unfurlers. Hand-drawn SVG at the canonical OG size, matching the live
// page's dark-astrology look, rasterised with @resvg/resvg-js (pure native
// module, no system Chromium needed — this box has no fontconfig/system
// fonts either, so the font is bundled in ./fonts and loaded explicitly).
// Pattern + tooling copied from didscope/og-gen.mjs.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// This is a static card, not tied to any real handle — game-over screens
// are shared via plain intent-compose text (see game.js gameOver()).
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// you change the artwork.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#0c0a14", BG2 = "#150f24", FG = "#f1ece2", DIM = "#9089a3";
const ACCENT = "#c792ff", FAINT = "#2a2438", GOLD = "#ffd166";

// planet → tetromino shape + color, copied from public/lib/cluster.js PLANET_SHAPE
// astrological glyphs aren't in JetBrains Mono's bundled coverage — a
// resvg render with no system fallback would show tofu, so this card is
// text-only (the live page renders the real glyphs fine via system fonts).
const PIECES = [
  { shape: "O", color: "#ffb454", label: "Sun" },
  { shape: "I", color: "#cdd6ff", label: "Moon" },
  { shape: "S", color: "#8affc1", label: "Mercury" },
  { shape: "T", color: "#ff9ecf", label: "Venus" },
  { shape: "Z", color: "#ff6d5f", label: "Mars" },
  { shape: "L", color: "#c792ff", label: "Jupiter" },
  { shape: "J", color: "#7fa8ff", label: "Saturn" },
];

const SHAPE_CELLS = {
  I: [[1, 0], [1, 1], [1, 2], [1, 3]],
  O: [[1, 1], [1, 2], [2, 1], [2, 2]],
  T: [[1, 0], [1, 1], [1, 2], [2, 1]],
  S: [[1, 1], [1, 2], [2, 0], [2, 1]],
  Z: [[1, 0], [1, 1], [2, 1], [2, 2]],
  J: [[1, 0], [2, 0], [2, 1], [2, 2]],
  L: [[1, 2], [2, 0], [2, 1], [2, 2]],
};

// ---- right side: a little stacked board built from the seven pieces -----
const BOARD_COLS = 8;
const BOARD_ROWS = 11;
const CELL = 34;
const boardX = 700, boardY = 70;
const boardW = BOARD_COLS * CELL, boardH = BOARD_ROWS * CELL;

// Hand-placed stack (row, col) -> color, roughly filling the bottom so it
// reads as "mid-game", topped by one falling piece per shape.
const stackCells = [
  [10, 0, "#7fa8ff"], [10, 1, "#7fa8ff"], [10, 2, "#ff6d5f"], [10, 3, "#ff6d5f"],
  [10, 4, "#ffb454"], [10, 5, "#ffb454"], [10, 6, "#c792ff"], [10, 7, "#8affc1"],
  [9, 0, "#7fa8ff"], [9, 1, "#ff9ecf"], [9, 2, "#ff9ecf"], [9, 3, "#ff9ecf"],
  [9, 4, "#cdd6ff"], [9, 5, "#cdd6ff"], [9, 6, "#cdd6ff"], [9, 7, "#cdd6ff"],
  [8, 1, "#8affc1"], [8, 2, "#8affc1"], [8, 5, "#c792ff"], [8, 6, "#c792ff"], [8, 7, "#c792ff"],
];

function cellRect(r, c, color, alpha = 1) {
  const x = boardX + c * CELL;
  const y = boardY + r * CELL;
  const pad = 2;
  return `<rect x="${x + pad}" y="${y + pad}" width="${CELL - pad * 2}" height="${CELL - pad * 2}" rx="4" fill="${color}" fill-opacity="${alpha}" stroke="rgba(255,255,255,0.35)" stroke-width="1.2"/>`;
}

let boardSvg = "";
boardSvg += `<rect x="${boardX}" y="${boardY}" width="${boardW}" height="${boardH}" fill="#000" rx="8"/>`;
for (const [r, c, color] of stackCells) boardSvg += cellRect(r, c, color);
// one falling piece near the top, using the L shape (Jupiter)
const fallCells = SHAPE_CELLS.L.map(([r, c]) => [r - 1, c + 2]);
for (const [r, c] of fallCells) boardSvg += cellRect(r, c, "#c792ff");

// ---- left: legend of the seven pieces ----
const legendY0 = 330;
const legendSvg = PIECES.map((p, i) => {
  const y = legendY0 + i * 30;
  return `
    <rect x="64" y="${y - 18}" width="16" height="16" rx="3" fill="${p.color}"/>
    <text x="90" y="${y - 5}" font-family="JetBrains Mono" font-size="15" fill="${FG}">${p.label} → <tspan fill="${p.color}" font-weight="700">${p.shape}</tspan></text>`;
}).join("");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="15%" cy="0%" r="55%">
      <stop offset="0" stop-color="#2a1a44"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="95%" cy="90%" r="55%">
      <stop offset="0" stop-color="#3a2255"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${ACCENT}"/>
      <stop offset="1" stop-color="${GOLD}"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>
  <rect width="${W}" height="${H}" fill="url(#glow2)"/>

  <text x="64" y="120" font-family="JetBrains Mono" font-weight="800" font-size="66" fill="url(#title)">moot<tspan fill="${FG}">tris</tspan></text>
  <text x="64" y="164" font-family="JetBrains Mono" font-size="20" fill="${DIM}">tetris, played with your social graph</text>

  <text x="64" y="216" font-family="JetBrains Mono" font-size="17" fill="${DIM}">every piece is one of your moots. its</text>
  <text x="64" y="242" font-family="JetBrains Mono" font-size="17" fill="${DIM}">shape comes from their star sign, its</text>
  <text x="64" y="268" font-family="JetBrains Mono" font-size="17" fill="${DIM}">speed from posts in the last 48h.</text>

  ${legendSvg}

  <text x="64" y="590" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${GOLD}">moottris.bisks.net</text>

  ${boardSvg}
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
