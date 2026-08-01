// Generates public/og.png — the Open Graph preview card for hypertower.
//
// A tumbled wireframe tesseract (computed the same way as the live scene's
// background decoration — see public/towerscene.js's updateTesseract, a
// fixed pose here instead of animated) hangs behind a small isometric
// column of locked blocks, standing in for the tower you build in-game.
// Rasterised with @resvg/resvg-js (pure native module, no system
// Chromium/fontconfig needed — the font is bundled in ./fonts).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// you change the artwork. Adapted from sites/cantilever/og-gen.mjs.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG_TOP = "#150836", BG_BOT = "#070212";
const INK = "#f2eeff", MUTED = "#9384c2";
const MAGENTA = "#ff2fd0", CYAN = "#26f2ff", GOLD = "#ffd23f", GOOD = "#4dffb0";

// ---- tumbled tesseract wireframe, projected to 2D with a fixed pose ----
const verts4 = [];
for (const a of [-1, 1]) for (const b of [-1, 1]) for (const c of [-1, 1]) for (const d of [-1, 1])
  verts4.push([a, b, c, d]);
const edges = [];
for (let i = 0; i < verts4.length; i++)
  for (let j = i + 1; j < verts4.length; j++) {
    let diff = 0;
    for (let k = 0; k < 4; k++) if (verts4[i][k] !== verts4[j][k]) diff++;
    if (diff === 1) edges.push([i, j]);
  }
const a1 = 0.55, a2 = 0.05;
const c1 = Math.cos(a1), s1 = Math.sin(a1), c2 = Math.cos(a2), s2 = Math.sin(a2);
const pts3 = verts4.map((v) => {
  const x = v[0] * c1 - v[3] * s1;
  const w = v[0] * s1 + v[3] * c1;
  const y = v[1] * c2 - v[2] * s2;
  const z = v[1] * s2 + v[2] * c2;
  const scale = 1 / (2.4 - w * 0.5);
  return [x * scale, y * scale, z * scale];
});
const TESS_CX = 860, TESS_CY = 300, TESS_R = 260;
let tessSvg = "";
for (const [i, j] of edges) {
  const p0 = pts3[i], p1 = pts3[j];
  const depth = (p0[2] + p1[2]) / 2;
  const op = (0.28 + (depth + 1) * 0.22).toFixed(2);
  tessSvg += `<line x1="${(TESS_CX + p0[0] * TESS_R).toFixed(1)}" y1="${(TESS_CY + p0[1] * TESS_R).toFixed(1)}" x2="${(TESS_CX + p1[0] * TESS_R).toFixed(1)}" y2="${(TESS_CY + p1[1] * TESS_R).toFixed(1)}" stroke="${MAGENTA}" stroke-width="1.6" opacity="${op}"/>`;
}

// ---- a small isometric column of locked blocks, standing in for the tower ----
const ISO_X = 0.5, ISO_Y = 0.28;
function cube(cx, topY, size, front, top, side) {
  const hw = size / 2;
  const topPts = [
    [cx, topY],
    [cx + hw, topY + hw * ISO_Y],
    [cx, topY + hw * ISO_Y * 2],
    [cx - hw, topY + hw * ISO_Y]
  ];
  const midY = topY + hw * ISO_Y * 2;
  const botY = midY + size * 0.72;
  let svg = `<polygon points="${topPts.map((p) => p.join(",")).join(" ")}" fill="${top}"/>`;
  svg += `<polygon points="${cx},${midY} ${cx + hw},${midY - hw * ISO_Y} ${cx + hw},${botY - hw * ISO_Y} ${cx},${botY}" fill="${front}"/>`;
  svg += `<polygon points="${cx},${midY} ${cx - hw},${midY - hw * ISO_Y} ${cx - hw},${botY - hw * ISO_Y} ${cx},${botY}" fill="${side}"/>`;
  return svg;
}
const blockColors = [
  ["#1fb8cc", "#5fe8f5", "#0d7a89"],
  ["#c9930f", "#ffd23f", "#8a6206"],
  ["#a628cc", "#d67dff", "#6d1a85"],
  ["#28a94a", "#5fe887", "#166b2e"],
  ["#c22e46", "#ff5f6f", "#7a1526"]
];
let towerSvg = "";
const towerCx = 900, size = 66;
let y = 560;
for (let i = 0; i < blockColors.length; i++) {
  const jitter = (i % 2 === 0 ? -1 : 1) * (i > 2 ? 6 : 0);
  towerSvg = cube(towerCx + jitter, y, size, blockColors[i][0], blockColors[i][1], blockColors[i][2]) + towerSvg;
  y -= size * 0.72;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${BG_TOP}"/>
      <stop offset="1" stop-color="${BG_BOT}"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="${MAGENTA}" stop-opacity="0.28"/>
      <stop offset="1" stop-color="${MAGENTA}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#sky)"/>
  <circle cx="${TESS_CX}" cy="${TESS_CY}" r="300" fill="url(#glow)"/>
  ${tessSvg}
  ${towerSvg}

  <text x="64" y="150" font-family="JetBrains Mono" font-weight="800" font-size="72" fill="${INK}">HYPERTOWER</text>
  <text x="66" y="192" font-family="JetBrains Mono" font-weight="700" font-size="26" fill="${CYAN}" letter-spacing="4">4D TETRIS</text>

  <text x="66" y="250" font-family="JetBrains Mono" font-size="21" fill="${MUTED}">pieces spawn tumbled through a hidden 4th axis —</text>
  <text x="66" y="280" font-family="JetBrains Mono" font-size="21" fill="${MUTED}">fold them flat across six planes before they land</text>

  <text x="66" y="340" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${GOOD}">1 2 3 = rotate in 3D</text>
  <text x="66" y="368" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${MAGENTA}">4 5 6 = rotate in 4D, align the plane</text>

  <text x="64" y="576" font-family="JetBrains Mono" font-weight="700" font-size="26" fill="${CYAN}">hypertower.bisks.net</text>
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
