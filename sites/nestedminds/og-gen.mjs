// Generates public/og.png — the Open Graph preview card for nestedminds.
// One big doll (the "perfect" one) plus the row of six it nests, and a
// tic-tac-toe board hinting at the gameplay. Rasterised with @resvg/resvg-js
// (pure native module, no system Chromium needed).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// you change the artwork. Adapted from sites/matryoshka/og-gen.mjs.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#0b1220";
const INK = "#eaf2ff";
const MUTED = "#7f93b8";
const ACCENT = "#35e0c0";
const ACCENT2 = "#ffb84d";

const ROW_COLORS = ["#3a4a63", "#39586f", "#2f6a7a", "#1f7a86", "#14948f", "#0dd8bd"];

function dollShape(cx, cy, s, color, glow, label) {
  const p = (x, y) => `${(cx + x * s).toFixed(1)},${(cy + y * s).toFixed(1)}`;
  // normalized coords from the app's SVG path (viewBox 0..200,0..260 -> centered ~[-0.5,0.5])
  const path =
    `M ${p(0, -0.77)} ` +
    `C ${p(-0.2, -0.77)} ${p(-0.29, -0.62)} ${p(-0.27, -0.42)} ` +
    `C ${p(-0.41, -0.35)} ${p(-0.46, -0.23)} ${p(-0.46, -0.06)} ` +
    `C ${p(-0.46, 0.15)} ${p(-0.29, 0.32)} ${p(0, 0.32)} ` +
    `C ${p(0.29, 0.32)} ${p(0.46, 0.15)} ${p(0.46, -0.06)} ` +
    `C ${p(0.46, -0.23)} ${p(0.41, -0.35)} ${p(0.27, -0.42)} ` +
    `C ${p(0.29, -0.62)} ${p(0.2, -0.77)} ${p(0, -0.77)} Z`;
  const glowAttr = glow ? ` filter="url(#dollGlow)"` : "";
  return `
  <path d="${path}"${glowAttr} fill="${color}" stroke="#00000030" stroke-width="${(s * 0.01).toFixed(1)}"/>
  <path d="M ${p(-0.27, -0.42)} C ${p(-0.12, -0.35)} ${p(0.12, -0.35)} ${p(0.27, -0.42)}" fill="none" stroke="#ffffff2e" stroke-width="${(s * 0.03).toFixed(1)}" stroke-linecap="round"/>
  <circle cx="${(cx - 0.1 * s).toFixed(1)}" cy="${(cy - 0.58 * s).toFixed(1)}" r="${(s * 0.03).toFixed(1)}" fill="#0c1420"/>
  <circle cx="${(cx + 0.1 * s).toFixed(1)}" cy="${(cy - 0.58 * s).toFixed(1)}" r="${(s * 0.03).toFixed(1)}" fill="#0c1420"/>
  <circle cx="${cx.toFixed(1)}" cy="${(cy + 0.08 * s).toFixed(1)}" r="${(s * 0.14).toFixed(1)}" fill="#ffffff22"/>
  <text x="${cx.toFixed(1)}" y="${(cy + 0.13 * s).toFixed(1)}" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="${(s * 0.14).toFixed(1)}" fill="#fff">${label}</text>`;
}

const rowY = 560;
const rowXs = [780, 850, 918, 984, 1048, 1110];
const rowShapes = ROW_COLORS.map((c, i) => dollShape(rowXs[i], rowY, 46, c, false, i)).join("\n");

const bigDoll = dollShape(970, 300, 300, ROW_COLORS[5], true, 5);

// small tic-tac-toe board, mostly empty with two moves in
const boardX = 640, boardY = 130, cell = 46;
let boardSvg = `<rect x="${boardX - 6}" y="${boardY - 6}" width="${cell * 3 + 12}" height="${cell * 3 + 12}" rx="8" fill="#1c2a45"/>`;
for (let r = 0; r < 3; r++) {
  for (let c = 0; c < 3; c++) {
    const x = boardX + c * cell, y = boardY + r * cell;
    boardSvg += `<rect x="${x}" y="${y}" width="${cell - 4}" height="${cell - 4}" rx="4" fill="#101a2e"/>`;
  }
}
const marks = [[0, 0, "X", ACCENT2], [1, 1, "O", ACCENT], [0, 2, "X", ACCENT2]];
for (const [r, c, m, col] of marks) {
  const x = boardX + c * cell + (cell - 4) / 2;
  const y = boardY + r * cell + (cell - 4) / 2;
  boardSvg += `<text x="${x}" y="${y + 9}" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="26" fill="${col}">${m}</text>`;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="75%" cy="35%" r="55%">
      <stop offset="0" stop-color="#123634"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <filter id="dollGlow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="10" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>

  <text x="64" y="140" font-family="JetBrains Mono" font-weight="800" font-size="64" fill="${ACCENT}">nestedminds</text>
  <text x="64" y="188" font-family="JetBrains Mono" font-size="21" fill="${MUTED}">a matryoshka doll of tic-tac-toe AIs.</text>
  <text x="64" y="216" font-family="JetBrains Mono" font-size="21" fill="${MUTED}">beat one, a smarter one is inside.</text>
  <text x="64" y="244" font-family="JetBrains Mono" font-size="21" fill="${MUTED}">one more rule each time.</text>

  ${boardSvg}

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="24" fill="${ACCENT}">nestedminds.bisks.net</text>

  ${bigDoll}
  ${rowShapes}
  <text x="780" y="600" text-anchor="middle" font-family="JetBrains Mono" font-size="14" fill="${MUTED}">chaos</text>
  <text x="1110" y="600" text-anchor="middle" font-family="JetBrains Mono" font-size="14" fill="${MUTED}">perfect</text>
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
