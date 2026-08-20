// Generates public/og.png — the Open Graph preview card for phonepile, so a
// shared link renders a little scattered pile of phones instead of a bare
// URL. Hand-drawn SVG, rasterised with @resvg/resvg-js (pure native module,
// no system Chromium/fontconfig needed — the font is bundled in ./fonts and
// loaded explicitly). Copied pattern from sites/didscope/og-gen.mjs.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#0a0c10", FG = "#eef1f6", DIM = "#8b93a3";
const ACCENT = "#5fb8ff", ACCENT2 = "#ff9f5f";

const PHONE_COLORS = ["#e9eaee", "#1428a0", "#1a73e8", "#0076ce", "#cf0a2c", "#eb0028", "#ff6900", "#a50034", "#12b8a6"];

function rectPhone(cx, cy, w, h, rot, fill) {
  return `<g transform="translate(${cx} ${cy}) rotate(${rot})">
    <rect x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" rx="${Math.min(w, h) * 0.14}" fill="${fill}" stroke="#00000055" stroke-width="1"/>
  </g>`;
}

// deterministic-ish scatter (seeded manually, not Math.random, so re-runs are stable)
const PILE = [
  [860, 430, 92, 190, -18, 0],
  [960, 360, 78, 160, 12, 1],
  [770, 360, 70, 145, 34, 2],
  [1040, 440, 84, 172, -8, 3],
  [900, 500, 100, 205, 6, 4],
  [1080, 340, 66, 136, -26, 5],
  [810, 470, 74, 152, 48, 6],
  [990, 500, 88, 180, -34, 7],
  [700, 430, 68, 140, -12, 8],
  [1120, 480, 76, 156, 20, 1],
  [740, 300, 60, 124, -44, 3],
  [1000, 250, 58, 120, 16, 4],
  [880, 250, 64, 132, -6, 0],
  [1100, 250, 54, 112, 40, 2],
];

const pileSvg = PILE.map(([x, y, w, h, rot, ci]) => rectPhone(x, y, w, h, rot, PHONE_COLORS[ci])).join("\n    ");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="15%" cy="0%" r="65%">
      <stop offset="0" stop-color="#12253a"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="95%" cy="90%" r="60%">
      <stop offset="0" stop-color="#2a1830"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${ACCENT}"/>
      <stop offset="1" stop-color="${ACCENT2}"/>
    </linearGradient>
    <radialGradient id="floor" cx="50%" cy="30%" r="70%">
      <stop offset="0" stop-color="#182030"/>
      <stop offset="1" stop-color="${BG}"/>
    </radialGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>
  <rect width="${W}" height="${H}" fill="url(#glow2)"/>

  <ellipse cx="920" cy="470" rx="380" ry="170" fill="url(#floor)"/>
  ${pileSvg}

  <text x="64" y="200" font-family="JetBrains Mono" font-weight="800" font-size="80" fill="url(#title)">phone<tspan fill="${FG}">pile</tspan></text>
  <text x="66" y="256" font-family="JetBrains Mono" font-size="23" fill="${DIM}">147 phones, real dimensions,</text>
  <text x="66" y="288" font-family="JetBrains Mono" font-size="23" fill="${DIM}">real physics. drag one and throw it.</text>

  <text x="66" y="352" font-family="JetBrains Mono" font-size="17" fill="${DIM}">the original 2007 iPhone through the</text>
  <text x="66" y="378" font-family="JetBrains Mono" font-size="17" fill="${DIM}">2026 lineup, every Galaxy S/Note, every</text>
  <text x="66" y="404" font-family="JetBrains Mono" font-size="17" fill="${DIM}">Pixel/Nexus, and the historic odd ones.</text>

  <text x="66" y="560" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${ACCENT2}">phonepile.bisks.net</text>
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
