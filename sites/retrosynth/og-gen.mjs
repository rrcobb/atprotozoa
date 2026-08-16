// Generates public/og.png — the Open Graph preview card for retrosynth.
//
// A little skeletal molecule (ball-and-stick, CPK-ish colors) next to the
// pitch. Rasterised with @resvg/resvg-js (pure native module, no system
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
const BG_TOP = "#0f1720", BG_BOT = "#06070a";
const INK = "#e8ecef", MUTED = "#8ea0ad";
const ACCENT = "#7ee3c3", ACCENT2 = "#ff9f6b", GOLD = "#e0c23b";

// a small fixed "molecule" — hand-placed, not random, so the card is stable
const atoms = [
  { x: 210, y: 260, sym: "C", fill: "#3a3f45", ink: "#e8ecef", r: 30 },
  { x: 300, y: 190, sym: "C", fill: "#3a3f45", ink: "#e8ecef", r: 30 },
  { x: 400, y: 230, sym: "N", fill: "#3b6fe0", ink: "#ffffff", r: 30 },
  { x: 300, y: 330, sym: "O", fill: "#e5453f", ink: "#ffffff", r: 30 },
  { x: 150, y: 370, sym: "S", fill: "#e0c23b", ink: "#1a1a1a", r: 32 },
  { x: 430, y: 350, sym: "Cl", fill: "#4fbf5a", ink: "#0a0a0a", r: 32 },
];
const bonds = [
  { a: 0, b: 1, order: 1 },
  { a: 1, b: 2, order: 2 },
  { a: 1, b: 3, order: 1 },
  { a: 0, b: 4, order: 1 },
  { a: 3, b: 5, order: 1 },
];

let bondsSvg = "";
for (const bd of bonds) {
  const a1 = atoms[bd.a], a2 = atoms[bd.b];
  const dx = a2.x - a1.x, dy = a2.y - a1.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;
  const offsets = bd.order === 1 ? [0] : bd.order === 2 ? [-5, 5] : [-8, 0, 8];
  for (const off of offsets) {
    bondsSvg += `<line x1="${a1.x + nx * off}" y1="${a1.y + ny * off}" x2="${a2.x + nx * off}" y2="${a2.y + ny * off}" stroke="#c7d0d6" stroke-width="4" stroke-linecap="round"/>`;
  }
}
let atomsSvg = "";
for (const a of atoms) {
  atomsSvg += `<circle cx="${a.x}" cy="${a.y}" r="${a.r}" fill="${a.fill}" stroke="#00000055" stroke-width="2"/>`;
  atomsSvg += `<text x="${a.x}" y="${a.y + 10}" font-family="JetBrains Mono" font-weight="800" font-size="${a.r}" fill="${a.ink}" text-anchor="middle">${a.sym}</text>`;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${BG_TOP}"/>
      <stop offset="1" stop-color="${BG_BOT}"/>
    </linearGradient>
    <radialGradient id="glow" cx="20%" cy="45%" r="55%">
      <stop offset="0" stop-color="${ACCENT}" stop-opacity="0.16"/>
      <stop offset="1" stop-color="${ACCENT}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>

  ${bondsSvg}
  ${atomsSvg}

  <text x="560" y="200" font-family="JetBrains Mono" font-weight="800" font-size="70" fill="${ACCENT}">retrosynth</text>
  <text x="560" y="250" font-family="JetBrains Mono" font-size="24" fill="${MUTED}">draw a molecule. get a total synthesis.</text>

  <text x="560" y="330" font-family="JetBrains Mono" font-size="23" fill="${INK}">~35% of the chemistry is wrong.</text>
  <text x="560" y="370" font-family="JetBrains Mono" font-size="23" fill="${GOLD}">one step only works because of a real</text>
  <text x="560" y="405" font-family="JetBrains Mono" font-size="23" fill="${GOLD}">advanced math theorem.</text>

  <text x="560" y="470" font-family="JetBrains Mono" font-size="20" fill="${ACCENT2}">no archons were bribed in the making of this site</text>

  <text x="560" y="576" font-family="JetBrains Mono" font-weight="700" font-size="26" fill="${ACCENT}">retrosynth.bisks.net</text>
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
