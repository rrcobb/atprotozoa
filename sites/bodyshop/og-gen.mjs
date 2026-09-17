// Generates public/og.png — the Open Graph preview card for bodyshop. Hand-
// drawn SVG at the canonical OG size, rasterised with @resvg/resvg-js (pure
// native module, no system Chromium/fontconfig needed — font is bundled in
// ./fonts and loaded explicitly). Copied from sites/revolver/og-gen.mjs.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// The car here is a hand-drawn stand-in (fixed hex colors, not hsl()) rather
// than a call into lib/cargen.js — resvg's SVG support doesn't reliably
// cover the hsl()/pattern fills the live renderer uses in a browser, so this
// stays a simpler, static illustration of the same silhouette family.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#14100c", FG = "#f2e8db", DIM = "#a8998a";
const ACCENT = "#ff8a3d", ACCENT2 = "#ffd24e", CARD = "#211a13", BORDER = "#3d3225";
const GRAIL = "#ffd24e", PAINT = "#8b3fd4", GLASS = "#bfe3f5";

// A low-poly lowrider on a lift, mirroring the silhouette style of
// lib/cargen.js's "low" family: flat bumpers, a raked windshield, one long
// low roof, a wide rear deck.
const bx = 700, by = 470; // body baseline (front-bottom corner) in card space
const outline = [
  [0, 0], [0, -14], [45, -45], [100, -80, true], [140, -105, true],
  [260, -105, true], [305, -80, true], [355, -40], [380, -14], [380, 0],
].map(([x, dy]) => [bx + x, by + dy]);
const bodyPath = outline.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x},${y}`).join(" ") + " Z";
const cab = outline.filter((_, i) => [3, 4, 5, 6].includes(i));
const winTop = cab.map(([x, y]) => [x, y + 8]);
const winBot = cab.map(([x, y]) => [x, y + 34]);
const windowPts = [...winTop, ...winBot.reverse()].map(([x, y]) => `${x},${y}`).join(" ");

const wheel = (cx, cy) => `
  <circle cx="${cx}" cy="${cy}" r="30" fill="#161616" stroke="#000" stroke-width="1.5"/>
  <circle cx="${cx}" cy="${cy}" r="16" fill="#c7ccd2" stroke="#8a8f96" stroke-width="1.5"/>
  <circle cx="${cx}" cy="${cy}" r="4" fill="#3a3f45"/>
`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="10%" cy="0%" r="55%">
      <stop offset="0" stop-color="#3a2410"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="95%" cy="100%" r="60%">
      <stop offset="0" stop-color="#241a0a"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${ACCENT}"/>
      <stop offset="1" stop-color="${ACCENT2}"/>
    </linearGradient>
    <linearGradient id="paint" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#b06fea"/>
      <stop offset="1" stop-color="${PAINT}"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>
  <rect width="${W}" height="${H}" fill="url(#glow2)"/>

  <text x="64" y="150" font-family="JetBrains Mono" font-weight="800" font-size="72" fill="url(#title)">bodyshop</text>
  <text x="64" y="196" font-family="JetBrains Mono" font-size="22" fill="${DIM}">pull a custom build for any <tspan fill="${ACCENT2}">handle</tspan></text>

  <text x="64" y="290" font-family="JetBrains Mono" font-size="17" fill="${DIM}">Enter a Bluesky handle and pull the lever: body</text>
  <text x="64" y="316" font-family="JetBrains Mono" font-size="17" fill="${DIM}">style, paint, kit, wheels, all rolled fresh. Rarity</text>
  <text x="64" y="342" font-family="JetBrains Mono" font-size="17" fill="${DIM}">runs junker to grail. Every pull joins your garage.</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${ACCENT2}">bodyshop.bisks.net</text>

  <rect x="${bx - 40}" y="${by + 20}" width="460" height="8" rx="4" fill="${BORDER}"/>
  ${wheel(bx + 100, by - 4)}
  ${wheel(bx + 305, by - 4)}
  <path d="${bodyPath}" fill="url(#paint)" stroke="#00000055" stroke-width="2" stroke-linejoin="round"/>
  <polygon points="${windowPts}" fill="${GLASS}" opacity="0.92"/>
  <rect x="${bx + 118}" y="${by - 118}" width="60" height="10" rx="2" fill="url(#paint)" stroke="#0006"/>
  <line x1="${bx + 130}" y1="${by - 108}" x2="${bx + 134}" y2="${by - 86}" stroke="#333" stroke-width="4"/>
  <line x1="${bx + 166}" y1="${by - 108}" x2="${bx + 162}" y2="${by - 86}" stroke="#333" stroke-width="4"/>

  <g>
    <rect x="${bx - 30}" y="${by - 180}" width="130" height="40" rx="8" fill="${GRAIL}"/>
    <text x="${bx + 35}" y="${by - 152}" font-family="JetBrains Mono" font-weight="800" font-size="22" fill="#1a1006" text-anchor="middle">GRAIL</text>
  </g>
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
