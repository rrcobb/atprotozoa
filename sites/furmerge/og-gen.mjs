// Generates public/og.png — the Open Graph preview card for furmerge, so a
// shared link auto-renders a picture of the fluff scale in Bluesky / other
// unfurlers. Hand-drawn SVG at the canonical OG size, matching the live
// page's warm cat-parlor look, rasterised with @resvg/resvg-js (pure native
// module, no system Chromium needed — this box has no fontconfig/system
// fonts either, so the font is bundled in ./fonts and loaded explicitly).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract (adapted from
// sites/didscope/og-gen.mjs). Re-run this by hand if you change the artwork.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#21170f", PANEL = "#362819", BORDER = "#4a3521", FG = "#fdf3e4", DIM = "#c9b190", ACCENT = "#e8b84b";

// Same breed list/order as public/game.js — least to most fluffy.
const BREEDS = [
  { name: "Sphynx", bg: "#3b3f46", fg: "#f2f2f2", furTufts: 0 },
  { name: "Devon Rex", bg: "#5b5346", fg: "#f5efe2", furTufts: 2 },
  { name: "Siamese", bg: "#8a6a4a", fg: "#fff7ea", furTufts: 3 },
  { name: "Bengal", bg: "#b8802f", fg: "#fff7ea", furTufts: 4 },
  { name: "Abyssinian", bg: "#c9832a", fg: "#fff7ea", furTufts: 5 },
  { name: "British Shorthair", bg: "#6f8fa6", fg: "#ffffff", furTufts: 6 },
  { name: "Scottish Fold", bg: "#8a99a8", fg: "#ffffff", furTufts: 7 },
  { name: "American Shorthair", bg: "#c9944f", fg: "#ffffff", furTufts: 8 },
  { name: "Maine Coon", bg: "#c06a2c", fg: "#ffffff", furTufts: 10 },
  { name: "Norwegian Forest Cat", bg: "#d68a3a", fg: "#ffffff", furTufts: 12 },
  { name: "Persian", bg: "#e8b84b", fg: "#4a3300", furTufts: 16 },
];

function catFace(breed, size) {
  const s = size;
  const cx = s / 2, cy = s / 2 + s * 0.04;
  const r = s * 0.3;
  let tufts = "";
  for (let i = 0; i < breed.furTufts; i++) {
    const a = (i / breed.furTufts) * Math.PI * 2 - Math.PI / 2;
    const len = r * (0.22 + (i % 3) * 0.06);
    const x1 = cx + Math.cos(a) * r, y1 = cy + Math.sin(a) * r;
    const x2 = cx + Math.cos(a) * (r + len), y2 = cy + Math.sin(a) * (r + len);
    tufts += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${breed.fg}" stroke-width="${(s * 0.02).toFixed(1)}" stroke-linecap="round" opacity="0.85"/>`;
  }
  const earL = `<path d="M ${cx - r * 0.85} ${cy - r * 0.55} L ${cx - r * 0.35} ${cy - r * 1.15} L ${cx - r * 0.1} ${cy - r * 0.55} Z" fill="${breed.bg}" stroke="${breed.fg}" stroke-width="${(s * 0.012).toFixed(1)}"/>`;
  const earR = `<path d="M ${cx + r * 0.85} ${cy - r * 0.55} L ${cx + r * 0.35} ${cy - r * 1.15} L ${cx + r * 0.1} ${cy - r * 0.55} Z" fill="${breed.bg}" stroke="${breed.fg}" stroke-width="${(s * 0.012).toFixed(1)}"/>`;
  const eyeY = cy - r * 0.05;
  return `${earL}${earR}
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="${breed.bg}" stroke="${breed.fg}" stroke-width="${(s * 0.015).toFixed(1)}"/>
    ${tufts}
    <ellipse cx="${cx - r * 0.35}" cy="${eyeY}" rx="${r * 0.12}" ry="${r * 0.14}" fill="${breed.fg}"/>
    <ellipse cx="${cx + r * 0.35}" cy="${eyeY}" rx="${r * 0.12}" ry="${r * 0.14}" fill="${breed.fg}"/>
    <path d="M ${cx} ${cy + r * 0.15} L ${cx - r * 0.1} ${cy + r * 0.28} L ${cx + r * 0.1} ${cy + r * 0.28} Z" fill="${breed.fg}"/>`;
}

const stripY = 430;
const n = BREEDS.length;
const stripW = W - 128;
const cell = stripW / n;
let strip = "";
BREEDS.forEach((b, i) => {
  const x = 64 + i * cell;
  const size = cell * 0.82;
  strip += `<g transform="translate(${(x + (cell - size) / 2).toFixed(1)}, ${stripY})">${catFace(b, size)}</g>`;
});

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow" cx="15%" cy="0%" r="70%">
      <stop offset="0" stop-color="#4a3418"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>

  <text x="64" y="120" font-family="JetBrains Mono" font-weight="800" font-size="68" fill="${ACCENT}">furmerge</text>
  <text x="64" y="164" font-family="JetBrains Mono" font-size="23" fill="${DIM}">a 2048-style merge game, but the tiles are cats</text>

  <rect x="64" y="220" width="${W - 128}" height="150" rx="16" fill="${PANEL}" stroke="${BORDER}" stroke-width="1.5"/>
  <text x="92" y="270" font-family="JetBrains Mono" font-weight="700" font-size="24" fill="${FG}">merge same-breed cats up the fluff scale</text>
  <text x="92" y="304" font-family="JetBrains Mono" font-size="19" fill="${DIM}">Sphynx</text>
  <text x="${W - 92}" y="304" text-anchor="end" font-family="JetBrains Mono" font-size="19" fill="${DIM}">Persian</text>
  <line x1="92" y1="330" x2="${W - 92}" y2="330" stroke="${BORDER}" stroke-width="2" stroke-dasharray="4,5"/>
  <line x1="92" y1="330" x2="${W - 92}" y2="330" stroke="${ACCENT}" stroke-width="2" opacity="0.5"/>

  ${strip}

  <text x="64" y="590" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${ACCENT}">bisks.net/games/furmerge</text>
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
