// Generates public/og.png — the Open Graph preview card for lasercats, so a
// shared link auto-renders a picture of the cat/laser/window scene in
// Bluesky / other unfurlers. Hand-drawn SVG at the canonical OG size,
// rasterised with @resvg/resvg-js (pure native module, no system
// Chromium/fontconfig needed — font bundled in ./fonts and loaded
// explicitly).
//
// No emoji here — the bundled mono font has no color-emoji glyphs and resvg
// would render a tofu box instead, so the cat/bird/moon are drawn as plain
// SVG shapes (same trick as sites/cluckstonks's chicken).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#05060a", WALL = "#241c2e", FG = "#f5efe6", DIM = "#b8a9c9";
const LASER = "#ff3b3b", ACCENT = "#ffd166", ACCENT2 = "#7fe0c9";
const SKY1 = "#1b1140", SKY2 = "#3a2160", INK = "#0c0810";

// ---- cat silhouette (simple shapes, walking toward the dot) ----
const catX = 900, catY = 430;
const CATFILL = "#332745";
const cat = `
  <g transform="translate(${catX} ${catY})" fill="${CATFILL}" stroke="${FG}" stroke-width="2" stroke-opacity="0.35" stroke-linejoin="round">
    <path d="M 55 -6 Q 115 -52 108 12 Q 100 48 58 26 Z"/>
    <ellipse cx="0" cy="0" rx="70" ry="42"/>
    <path d="M -85 -62 L -68 -20 L -50 -56 Z"/>
    <path d="M -22 -62 L -40 -20 L -50 -56 Z"/>
    <circle cx="-55" cy="-38" r="34"/>
    <circle cx="-63" cy="-40" r="4" fill="${ACCENT}" stroke="none"/>
    <circle cx="-45" cy="-40" r="4" fill="${ACCENT}" stroke="none"/>
  </g>`;

// ---- night window ----
const winX = 100, winY = 110, winW = 420, winH = 300;
const window_ = `
  <g>
    <rect x="${winX - 8}" y="${winY - 8}" width="${winW + 16}" height="${winH + 16}" rx="6" fill="${INK}"/>
    <defs>
      <linearGradient id="sky" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${SKY1}"/>
        <stop offset="1" stop-color="${SKY2}"/>
      </linearGradient>
    </defs>
    <rect x="${winX}" y="${winY}" width="${winW}" height="${winH}" fill="url(#sky)"/>
    <circle cx="${winX + winW - 70}" cy="${winY + 60}" r="26" fill="${ACCENT}" opacity="0.9"/>
    <circle cx="${winX + 90}" cy="${winY + 50}" r="2.5" fill="${FG}" opacity="0.8"/>
    <circle cx="${winX + 150}" cy="${winY + 90}" r="2" fill="${FG}" opacity="0.7"/>
    <circle cx="${winX + 60}" cy="${winY + 130}" r="2" fill="${FG}" opacity="0.6"/>
    <path d="M ${winX + 60} ${winY + 200} l 22 -10 l 22 10" stroke="${FG}" stroke-width="4" fill="none" opacity="0.85"/>
    <path d="M ${winX + 220} ${winY + 240} l 22 -10 l 22 10" stroke="${FG}" stroke-width="4" fill="none" opacity="0.85"/>
    <rect x="${winX + winW / 2 - 2.5}" y="${winY}" width="5" height="${winH}" fill="${INK}"/>
    <rect x="${winX}" y="${winY + winH / 2 - 2.5}" width="${winW}" height="5" fill="${INK}"/>
  </g>`;

const svg = `
<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${LASER}"/>
      <stop offset="1" stop-color="${ACCENT}"/>
    </linearGradient>
    <filter id="glow" x="-100%" y="-100%" width="300%" height="300%">
      <feGaussianBlur stdDeviation="8" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="${WALL}" opacity="0.35"/>

  ${window_}

  <circle cx="${catX - 130}" cy="${catY + 5}" r="9" fill="${LASER}" filter="url(#glow)"/>
  ${cat}

  <text x="64" y="470" font-family="JetBrains Mono" font-weight="800" font-size="72" fill="url(#title)">lasercats</text>
  <text x="66" y="512" font-family="JetBrains Mono" font-size="21" fill="${DIM}">a whimsical 2:09 music video —</text>
  <text x="66" y="540" font-family="JetBrains Mono" font-size="21" fill="${DIM}">chase the laser, ignore the humans</text>

  <text x="66" y="590" font-family="JetBrains Mono" font-weight="700" font-size="24" fill="${ACCENT2}">bisks.net/lasercats</text>
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
