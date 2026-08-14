// Generates public/og.png — the Open Graph preview card for purrbox, so a
// shared link unfurls as the cat instead of a bare URL.
//
// Rasterised with @resvg/resvg-js (pure native module, no system Chromium
// needed — font bundled in ./fonts). Adapted from
// sites/vadrone/og-gen.mjs.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200,
  H = 630;
const BG = "#17110c";
const INK = "#f6ead9";
const MUTED = "#a4907a";
const FAINT = "#372a1f";
const SIZE = "#e8935a";
const TEMP = "#7ec8e3";
const MOOD = "#f2a6b8";
const FUR = "#c98850";
const BELLY = "#f1d9b8";

// A small cat face sitting in the right half of the card, roughly the same
// shapes as the live illustration but static — no need to fully mirror the
// app markup for a fixed preview image.
const CX = 940,
  CY = 330;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow" cx="78%" cy="20%" r="65%">
      <stop offset="0" stop-color="#2a1a0d"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>

  <text x="76" y="150" font-family="JetBrains Mono" font-weight="700" font-size="22" letter-spacing="6" fill="${SIZE}">CAT SIZE · ROOM TEMP · CAT MOOD</text>
  <text x="76" y="230" font-family="JetBrains Mono" font-weight="800" font-size="72" letter-spacing="1" fill="${INK}">purrbox</text>
  <text x="76" y="284" font-family="JetBrains Mono" font-size="22" fill="${MUTED}">a synthesized cat purr, tuned live</text>

  <text x="76" y="420" font-family="JetBrains Mono" font-size="19" fill="${MUTED}">a real purr's motor is a ~25Hz muscle</text>
  <text x="76" y="452" font-family="JetBrains Mono" font-size="19" fill="${MUTED}">twitch. this schedules that pulse live,</text>
  <text x="76" y="484" font-family="JetBrains Mono" font-size="19" fill="${MUTED}">bent by size, warmth and mood.</text>
  <text x="76" y="560" font-family="JetBrains Mono" font-weight="700" font-size="24" fill="${SIZE}">purrbox.bisks.net</text>

  <g>
    <ellipse cx="${CX}" cy="${CY + 90}" rx="130" ry="80" fill="${FUR}"/>
    <ellipse cx="${CX}" cy="${CY + 108}" rx="60" ry="42" fill="${BELLY}"/>
    <path d="M ${CX + 130} ${CY + 130} C ${CX + 200} ${CY + 122}, ${CX + 206} ${CY + 40}, ${CX + 160} ${CY + 10} C ${CX + 194} ${CY + 46}, ${CX + 186} ${CY + 104}, ${CX + 112} ${CY + 112} Z" fill="${FUR}"/>
    <path d="M ${CX - 62} ${CY - 6} L ${CX - 98} ${CY - 84} L ${CX - 24} ${CY - 22} Z" fill="${FUR}"/>
    <path d="M ${CX - 62} ${CY - 18} L ${CX - 82} ${CY - 62} L ${CX - 38} ${CY - 30} Z" fill="${MOOD}" opacity="0.75"/>
    <path d="M ${CX + 62} ${CY - 6} L ${CX + 98} ${CY - 84} L ${CX + 24} ${CY - 22} Z" fill="${FUR}"/>
    <path d="M ${CX + 62} ${CY - 18} L ${CX + 82} ${CY - 62} L ${CX + 38} ${CY - 30} Z" fill="${MOOD}" opacity="0.75"/>
    <circle cx="${CX}" cy="${CY}" r="98" fill="${FUR}"/>
    <ellipse cx="${CX - 40}" cy="${CY - 4}" rx="10" ry="13" fill="#1b140d"/>
    <ellipse cx="${CX + 40}" cy="${CY - 4}" rx="10" ry="13" fill="#1b140d"/>
    <path d="M ${CX - 12} ${CY + 24} L ${CX + 12} ${CY + 24} L ${CX} ${CY + 40} Z" fill="${MOOD}"/>
    <path d="M ${CX} ${CY + 40} Q ${CX - 20} ${CY + 58} ${CX - 36} ${CY + 46} M ${CX} ${CY + 40} Q ${CX + 20} ${CY + 58} ${CX + 36} ${CY + 46}" stroke="#1b140d" stroke-width="4" fill="none" stroke-linecap="round"/>
  </g>

  <rect x="76" y="330" width="230" height="6" rx="3" fill="${FAINT}"/>
  <rect x="76" y="330" width="130" height="6" rx="3" fill="${SIZE}"/>
  <rect x="76" y="358" width="230" height="6" rx="3" fill="${FAINT}"/>
  <rect x="76" y="358" width="150" height="6" rx="3" fill="${TEMP}"/>
  <rect x="76" y="386" width="230" height="6" rx="3" fill="${FAINT}"/>
  <rect x="76" y="386" width="170" height="6" rx="3" fill="${MOOD}"/>
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
