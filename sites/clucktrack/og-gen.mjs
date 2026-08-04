// Generates public/og.png — the static Open Graph preview card for the bare
// clucktrack link. Hand-drawn SVG, rasterised with @resvg/resvg-js and
// skyclone's bundled JetBrains Mono font (no system Chromium/fontconfig
// needed). Same recipe as sites/moistchicken/og-gen.mjs (copy, don't
// abstract).
//
//   node og-gen.mjs   # writes ./public/og.png (borrows resvg + the font
//                      # from sites/skyclone — build-time only, not a
//                      # runtime dependency of this site)

import { Resvg } from "../skyclone/node_modules/@resvg/resvg-js/index.js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const fontPath = fileURLToPath(new URL("../skyclone/fonts/JetBrainsMono.ttf", import.meta.url));

const W = 1200, H = 630;
const BG = "#081a1c", INK = "#eafcf6", MUTED = "#7ea8a3";
const ACCENT = "#22d3c6", ACCENT2 = "#0ea5b7", LIKE = "#ff6f91";
const CARD = "#0e2528", BORDER = "#173c3e";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function windowCard(x, y, w, label, ratio) {
  return `
  <g>
    <rect x="${x}" y="${y}" width="${w}" height="86" rx="12" fill="${CARD}" stroke="${BORDER}"/>
    <text x="${x + 18}" y="${y + 30}" font-family="JetBrains Mono" font-size="13" fill="${MUTED}">${esc(label)}</text>
    <text x="${x + 18}" y="${y + 64}" font-family="JetBrains Mono" font-weight="800" font-size="26" fill="${LIKE}">♥ ${ratio}</text>
  </g>`;
}

const windows = [
  ["last hour", "1.20"],
  ["last 8 hours", "2.85"],
  ["last 12 hours", "3.40"],
  ["last 24 hours", "4.95"],
  ["last week", "9.10"],
];
const cardW = (1072 - 4 * 16) / 5;
const windowRow = windows
  .map(([label, ratio], i) => windowCard(64 + i * (cardW + 16), 236, cardW, label, ratio))
  .join("");

// A small rising sparkline to sell "graph over time"
const pts = [0.3, 0.5, 0.4, 0.8, 0.6, 1.1, 1.0, 1.6, 1.4, 2.1, 2.6, 3.4];
const sx = 64, sy = 448, sw = 1072, sh = 100;
const max = Math.max(...pts);
const path = pts
  .map((v, i) => {
    const x = sx + (i / (pts.length - 1)) * sw;
    const y = sy + sh - (v / max) * sh;
    return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
  })
  .join(" ");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="50%" cy="-5%" r="60%">
      <stop offset="0" stop-color="#103638"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="fillgrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${ACCENT}" stop-opacity="0.35"/>
      <stop offset="1" stop-color="${ACCENT}" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>

  <text x="60" y="118" font-family="JetBrains Mono" font-weight="800" font-size="56" fill="${ACCENT}">🐔📈 clucktrack</text>
  <text x="64" y="160" font-family="JetBrains Mono" font-size="22" fill="${MUTED}">your own likes-per-follower, five windows + a graph</text>

  <rect x="64" y="196" width="1072" height="1" fill="${BORDER}"/>

  ${windowRow}

  <text x="64" y="${sy - 18}" font-family="JetBrains Mono" font-size="14" fill="${MUTED}">rolling 24h likes/follower — last 7 days</text>
  <path d="${path} L${sx + sw},${sy + sh} L${sx},${sy + sh} Z" fill="url(#fillgrad)" stroke="none"/>
  <path d="${path}" fill="none" stroke="${ACCENT}" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"/>

  <text x="64" y="588" font-family="JetBrains Mono" font-size="16" fill="${MUTED}">clucktrack.bisks.net</text>
</svg>`;

const resvg = new Resvg(svg, {
  fitTo: { mode: "width", value: W },
  font: { fontFiles: [fontPath], loadSystemFonts: false, defaultFontFamily: "JetBrains Mono" },
});
const png = resvg.render().asPng();
const out = fileURLToPath(new URL("./public/og.png", import.meta.url));
writeFileSync(out, png);
console.log("wrote", out, png.length, "bytes");
