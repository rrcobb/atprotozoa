// Generates public/og.png — the Open Graph preview card for claudoku, so a
// shared link auto-renders a picture of the game in Bluesky / other unfurlers.
//
// Hand-drawn SVG: the sparkle mascot (same shapes as the in-page symbol),
// title/tagline, and a real generated killer-sudoku board — actual cages and
// sums from engine.js, not a mockup — with the classic dashed-cage look.
// Rasterised with @resvg/resvg-js (pure native module, no system Chromium
// needed).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// Deterministic seed, so the card is stable across builds. House style:
// self-contained, copy-don't-abstract (this is a cousin of
// sites/mootrider/og-gen.mjs). Re-run by hand if you change the artwork.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Claudoku from "./public/engine.js";

const W = 1200, H = 630;
const BG = "#0c0e14", PANEL = "#12141c", INK = "#e8ecf6", DIM = "#8b93a7",
  LINE = "#242a3c", ORANGE = "#e8926f", ORANGE_DEEP = "#c96442", CREAM = "#f0eee6",
  TEAL = "#5ce1c6";

// ── a real puzzle, so the cages/sums on the card are genuine ────────────────
const puzzle = Claudoku.generatePuzzle("og-card-v1");

// ── mini board (right side) ──────────────────────────────────────────────
const boardPx = 420, U = boardPx / 9, M = boardPx * 0.008;
const boardX = W - boardPx - 84, boardY = (H - boardPx) / 2;

let boardSvg = "";
for (let i = 0; i <= 9; i++) {
  boardSvg += `<line x1="${i*U}" y1="0" x2="${i*U}" y2="${boardPx}" stroke="rgba(255,255,255,.10)" stroke-width="1.5"/>`;
  boardSvg += `<line x1="0" y1="${i*U}" x2="${boardPx}" y2="${i*U}" stroke="rgba(255,255,255,.10)" stroke-width="1.5"/>`;
}
for (let i = 0; i <= 9; i += 3) {
  boardSvg += `<line x1="${i*U}" y1="0" x2="${i*U}" y2="${boardPx}" stroke="${ORANGE}" stroke-opacity=".55" stroke-width="4"/>`;
  boardSvg += `<line x1="0" y1="${i*U}" x2="${boardPx}" y2="${i*U}" stroke="${ORANGE}" stroke-opacity=".55" stroke-width="4"/>`;
}

const margin = 4.5;
puzzle.cages.forEach((cg) => {
  const cellSet = new Set(cg.cells.map(([r, c]) => r * 9 + c));
  const hue = Math.round((cg.color * 137.508) % 360);
  const stroke = `hsl(${hue} 70% 62%)`;
  const has = (dr, dc, r, c) => {
    const nr = r + dr, nc = c + dc;
    if (nr < 0 || nr > 8 || nc < 0 || nc > 8) return false;
    return cellSet.has(nr * 9 + nc);
  };
  let anchor = cg.cells[0];
  cg.cells.forEach(([r, c]) => {
    if (r < anchor[0] || (r === anchor[0] && c < anchor[1])) anchor = [r, c];
    const x0 = c * U, y0 = r * U;
    const seg = (x1, y1, x2, y2) =>
      `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="2.6" stroke-dasharray="5 4.5" stroke-linecap="round"/>`;
    if (!has(-1, 0, r, c)) boardSvg += seg(x0+margin, y0+margin, x0+U-margin, y0+margin);
    if (!has(1, 0, r, c)) boardSvg += seg(x0+margin, y0+U-margin, x0+U-margin, y0+U-margin);
    if (!has(0, -1, r, c)) boardSvg += seg(x0+margin, y0+margin, x0+margin, y0+U-margin);
    if (!has(0, 1, r, c)) boardSvg += seg(x0+U-margin, y0+margin, x0+U-margin, y0+U-margin);
  });
  const lx = anchor[1]*U+margin+2, ly = anchor[0]*U+margin+10;
  boardSvg += `<text x="${lx}" y="${ly}" font-family="JetBrains Mono" font-size="10.5" font-weight="700" fill="hsl(${hue} 85% 80%)" paint-order="stroke" stroke="${PANEL}" stroke-width="2.2">${cg.sum}</text>`;
});

// a handful of solved digits scattered in, so the board reads as "in progress"
const REVEAL = [4, 12, 20, 29, 37, 44, 52, 60, 68, 76];
REVEAL.forEach((i) => {
  const r = Math.floor(i / 9), c = i % 9;
  boardSvg += `<text x="${c*U+U/2}" y="${r*U+U/2+7}" text-anchor="middle" font-family="JetBrains Mono" font-size="20" font-weight="700" fill="${CREAM}" opacity=".85">${puzzle.solution[i]}</text>`;
});

// ── mascot (left side) — same shapes as public/index.html's #mascot-yay ────
const mx = 150, my = 300, ms = 1.55; // position + scale
const mascot = `
  <g transform="translate(${mx - 50*ms},${my - 50*ms}) scale(${ms})">
    <path d="M82 6 L87 18 L99 23 L87 28 L82 40 L77 28 L65 23 L77 18 Z" fill="#f2c9a0"/>
    <path d="M12 20 L15 27 L22 30 L15 33 L12 40 L9 33 L2 30 L9 27 Z" fill="#f2c9a0"/>
    <path d="M20 66 L23 73 L30 76 L23 79 L20 86 L17 79 L10 76 L17 73 Z" fill="#f2c9a0"/>
    <ellipse cx="12" cy="52" rx="6" ry="10" fill="url(#mgrad)" transform="rotate(-30 12 52)"/>
    <ellipse cx="88" cy="52" rx="6" ry="10" fill="url(#mgrad)" transform="rotate(30 88 52)"/>
    <rect x="18" y="30" width="64" height="56" rx="28" fill="url(#mgrad)"/>
    <ellipse cx="30" cy="68" rx="7.5" ry="5" fill="#ffdca8" opacity=".6"/>
    <ellipse cx="70" cy="68" rx="7.5" ry="5" fill="#ffdca8" opacity=".6"/>
    <path d="M32 55 Q38 47 44 55" stroke="#2a160f" stroke-width="3.4" fill="none" stroke-linecap="round"/>
    <path d="M56 55 Q62 47 68 55" stroke="#2a160f" stroke-width="3.4" fill="none" stroke-linecap="round"/>
    <path d="M38 68 Q50 82 62 68" stroke="#2a160f" stroke-width="3.6" fill="none" stroke-linecap="round"/>
  </g>`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="bg" cx="50%" cy="-10%" r="90%">
      <stop offset="0" stop-color="#1b1712"/>
      <stop offset="0.6" stop-color="${BG}"/>
      <stop offset="1" stop-color="${BG}"/>
    </radialGradient>
    <linearGradient id="mgrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#eda483"/>
      <stop offset="1" stop-color="${ORANGE_DEEP}"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#bg)"/>

  ${mascot}

  <text x="74" y="470" font-family="JetBrains Mono" font-weight="700"
    font-size="66" letter-spacing="1" fill="${ORANGE}">claudoku</text>
  <text x="74" y="512" font-family="JetBrains Mono" font-size="21"
    fill="${DIM}">killer sudoku with a sparkly sidekick</text>
  <text x="74" y="548" font-family="JetBrains Mono" font-size="18"
    fill="${INK}">no starting digits — just <tspan fill="${ORANGE}">cage sums</tspan>.</text>
  <text x="74" y="576" font-family="JetBrains Mono" font-size="18"
    fill="${INK}">a new one every day.</text>

  <rect x="${boardX - 20}" y="${boardY - 20}" width="${boardPx + 40}" height="${boardPx + 40}"
    rx="16" fill="${PANEL}" stroke="${LINE}" stroke-width="1.5"/>
  <g transform="translate(${boardX},${boardY})">${boardSvg}</g>

  <text x="${W - 74}" y="588" text-anchor="end" font-family="JetBrains Mono"
    font-size="16" fill="${TEAL}">claudoku.bisks.net</text>
</svg>`;

const fontPath = fileURLToPath(new URL("./fonts/JetBrainsMono.ttf", import.meta.url));
const resvg = new Resvg(svg, {
  fitTo: { mode: "width", value: W },
  font: { fontFiles: [fontPath], loadSystemFonts: false, defaultFontFamily: "JetBrains Mono" },
});
const png = resvg.render().asPng();
const out = fileURLToPath(new URL("./public/og.png", import.meta.url));
writeFileSync(out, png);
console.log("wrote", out);
