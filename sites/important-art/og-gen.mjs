// Generates public/og.png — the Open Graph preview card for important-art.
// Same recipe as sites/receipts/og-gen.mjs: hand-drawn SVG at the canonical
// OG size, rasterised with @resvg/resvg-js (no system Chromium needed).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#05040a", GOLD = "#e8c88a", GOLD_BRIGHT = "#ffe9b8", INK = "#f4ede1", DIM = "#b9ad9a";
const BRONZE1 = "#1b140f", BRONZE2 = "#2a1e14", BORDER = "#4a3a26";
const DOTS = ["#ff5c8a", "#ffd166", "#4ecdc4", "#8c7bff", "#38bdf8", "#9dffb0"];

function seeded(seed) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}
const rand = seeded(42);

let dots = "";
for (let i = 0; i < 140; i++) {
  const x = Math.round(rand() * W);
  const y = Math.round(rand() * H);
  const c = DOTS[i % DOTS.length];
  const r = 1.6 + rand() * 2.2;
  dots += `<circle cx="${x}" cy="${y}" r="${r.toFixed(2)}" fill="${c}" opacity="${(0.35 + rand() * 0.45).toFixed(2)}"/>`;
}

const cardX = 90, cardY = 100, cardW = 1020, cardH = 430;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="plaque" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${BRONZE2}"/>
      <stop offset="0.6" stop-color="${BRONZE1}"/>
    </linearGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${GOLD}"/>
      <stop offset="1" stop-color="${GOLD_BRIGHT}"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  ${dots}
  <rect width="${W}" height="${H}" fill="${BG}" opacity="0.35"/>

  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="6" fill="url(#plaque)" stroke="${BORDER}" stroke-width="2"/>

  <text x="${W / 2}" y="${cardY + 68}" text-anchor="middle" font-family="JetBrains Mono" font-size="16" letter-spacing="3" fill="${GOLD}">A COMMEMORATIVE PLAQUE</text>

  <text x="${W / 2}" y="${cardY + 150}" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="46" fill="url(#title)">important art</text>

  <text x="${W / 2}" y="${cardY + 202}" text-anchor="middle" font-family="JetBrains Mono" font-size="20" fill="${INK}">in celebration of the launch of fluoddity.com</text>

  <text x="${W / 2}" y="${cardY + 250}" text-anchor="middle" font-family="JetBrains Mono" font-size="15" fill="${DIM}">hundreds of thousands of particles, self-organizing into a</text>
  <text x="${W / 2}" y="${cardY + 274}" text-anchor="middle" font-family="JetBrains Mono" font-size="15" fill="${DIM}">stunning variety of structures — mutation and artificial selection</text>

  <text x="${W / 2}" y="${cardY + 340}" text-anchor="middle" font-family="JetBrains Mono" font-style="italic" font-size="18" fill="${INK}">&#8220;this is important art&#8221;</text>
  <text x="${W / 2}" y="${cardY + 366}" text-anchor="middle" font-family="JetBrains Mono" font-size="14" fill="${DIM}">— @words.bsky.social, on @all-paperclips.bsky.social's fluoddity.com</text>

  <text x="${W / 2}" y="${cardY + cardH - 34}" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${GOLD}">important-art.bisks.net</text>
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
