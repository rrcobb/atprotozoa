// Generates public/og.png — the Open Graph preview card for explainu-chan.
// Hand-drawn SVG at the canonical OG size, rasterised with @resvg/resvg-js
// (pure native module, no system Chromium/fontconfig needed — the font is
// bundled in ./fonts and loaded explicitly).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// Adapted from sites/ngmi/og-gen.mjs — copy, don't abstract.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#1a1330", FG = "#fdf3ff", DIM = "#b6a9d6";
const PINK = "#ff7ec8", CYAN = "#6cf3ff", LILAC = "#b492ff", CARD = "#2a1f4d", BORDER = "#4a3a7a";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// --- chibi figure, same shapes as the CSS version, redrawn as plain SVG ---
const fx = 130, fy = 120; // figure origin
const figureSvg = `
  <g transform="translate(${fx}, ${fy})">
    <ellipse cx="90" cy="90" rx="72" ry="76" fill="${LILAC}"/>
    <rect x="-2" y="40" width="20" height="110" rx="10" fill="${LILAC}" transform="rotate(-8 8 95)"/>
    <rect x="162" y="40" width="20" height="110" rx="10" fill="${LILAC}" transform="rotate(8 172 95)"/>
    <ellipse cx="90" cy="98" rx="52" ry="50" fill="#ffe4d1"/>
    <path d="M 34 76 Q 90 20 146 76 L 146 100 Q 90 60 34 100 Z" fill="${LILAC}"/>
    <circle cx="68" cy="104" r="7" fill="#241a42"/>
    <circle cx="112" cy="104" r="7" fill="#241a42"/>
    <circle cx="70" cy="101" r="2.4" fill="#fff"/>
    <circle cx="114" cy="101" r="2.4" fill="#fff"/>
    <ellipse cx="56" cy="122" rx="7" ry="4" fill="${PINK}" opacity="0.55"/>
    <ellipse cx="124" cy="122" rx="7" ry="4" fill="${PINK}" opacity="0.55"/>
    <path d="M 80 132 Q 90 140 100 132" stroke="#a8593f" stroke-width="3" fill="none" stroke-linecap="round"/>
    <rect x="10" y="168" width="160" height="150" rx="26" fill="${CARD}" stroke="${CYAN}" stroke-width="3"/>
    <path d="M 30 168 h140 M 10 198 h160 M 10 228 h160 M 10 258 h160 M 10 288 h160" stroke="#ffffff" stroke-opacity="0.14" stroke-width="2"/>
    <path d="M 50 168 v150 M 90 168 v150 M 130 168 v150" stroke="#ffffff" stroke-opacity="0.14" stroke-width="2"/>
    <rect x="46" y="206" width="44" height="44" rx="8" fill="${FG}" stroke="${PINK}" stroke-width="3" transform="rotate(-4 68 228)"/>
    <text x="68" y="224" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="9" fill="${BG}" transform="rotate(-4 68 228)">EXPL</text>
    <text x="68" y="234" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="9" fill="${BG}" transform="rotate(-4 68 228)">AINU</text>
    <rect x="150" y="214" width="58" height="8" rx="4" fill="${CYAN}" transform="rotate(-20 150 214)"/>
  </g>`;

const bubbleLines = [
  "“a libgrid is the grid your",
  "solver’s branch-and-bound walks —",
  "four lanes, each pinned to a core,",
  "pruning squares that can’t win.”",
];
const bx = 470, by = 60, bw = 668, bh = 400;
const bubbleTextSvg = bubbleLines
  .map((l, i) => `<text x="${bx + 40}" y="${by + 110 + i * 34}" font-family="JetBrains Mono" font-size="24" fill="${FG}">${esc(l)}</text>`)
  .join("\n    ");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="15%" cy="-10%" r="60%">
      <stop offset="0" stop-color="#3a1a52"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="100%" cy="10%" r="55%">
      <stop offset="0" stop-color="#12233f"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${PINK}"/>
      <stop offset="1" stop-color="${CYAN}"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>
  <rect width="${W}" height="${H}" fill="url(#glow2)"/>

  ${figureSvg}

  <rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="22" fill="${CARD}" stroke="${BORDER}" stroke-width="1.5"/>
  <path d="M ${bx} ${by + 210} l -26 24 l 26 20 Z" fill="${CARD}"/>
  <text x="${bx + 40}" y="${by + 56}" font-family="JetBrains Mono" font-weight="700" font-size="18" fill="${PINK}">explainu-chan</text>
  ${bubbleTextSvg}
  <text x="${bx + 40}" y="${by + 340}" font-family="JetBrains Mono" font-size="16" fill="${DIM}">libgrid-chan wouldn’t say it first. so.</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="800" font-size="34" fill="url(#title)">explainu-chan</text>
  <text x="64" y="592" font-family="JetBrains Mono" font-size="17" fill="${DIM}">explainu-chan.bisks.net</text>
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
