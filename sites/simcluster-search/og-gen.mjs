// Generates public/og.png — the Open Graph preview card for simcluster
// search. Same recipe as sites/receipts/og-gen.mjs: hand-drawn SVG at the
// canonical OG size, rasterised with @resvg/resvg-js (no system Chromium
// needed).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#0c1512", FG = "#eef7f4", DIM = "#8fada4";
const CORE = "#2fd6ae", ADJ = "#b98ae8", CARD = "#101d18", BORDER = "#233a32";

// Deterministic dot field: a tight core clump (golden-angle spiral, small
// radius) plus a looser adjacent ring further out. No Math.random — this
// script is a one-shot local generator, not a resumable workflow, but a
// fixed layout means re-running it reproduces the same image.
const GOLDEN = 137.50776405003785 * (Math.PI / 180);
function spiralPoint(i, spacing) {
  const r = spacing * Math.sqrt(i + 0.5);
  const a = i * GOLDEN;
  return [r * Math.cos(a), r * Math.sin(a)];
}

const cx = 870, cy = 330;
const coreDots = Array.from({ length: 26 }, (_, i) => {
  const [x, y] = spiralPoint(i, 9);
  return { x: cx + x, y: cy + y, r: 5 + (i % 3) };
});
const adjDots = Array.from({ length: 34 }, (_, i) => {
  const [x, y] = spiralPoint(i, 15.5);
  const ang = i * GOLDEN;
  const jitter = 70 + (i % 5) * 8;
  return { x: cx + Math.cos(ang) * jitter, y: cy + Math.sin(ang) * jitter, r: 3 + (i % 2) };
});

const coreSvg = coreDots
  .map((d) => `<circle cx="${d.x.toFixed(1)}" cy="${d.y.toFixed(1)}" r="${d.r}" fill="${CORE}" opacity="0.92"/>`)
  .join("\n  ");
const adjSvg = adjDots
  .map((d) => `<circle cx="${d.x.toFixed(1)}" cy="${d.y.toFixed(1)}" r="${d.r}" fill="${ADJ}" opacity="0.55"/>`)
  .join("\n  ");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="6%" cy="0%" r="60%">
      <stop offset="0" stop-color="#0d2a22"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="98%" cy="10%" r="55%">
      <stop offset="0" stop-color="#241236"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${CORE}"/>
      <stop offset="1" stop-color="${ADJ}"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>
  <rect width="${W}" height="${H}" fill="url(#glow2)"/>

  <text x="64" y="140" font-family="JetBrains Mono" font-weight="800" font-size="52" fill="url(#title)">simcluster search</text>
  <text x="64" y="182" font-family="JetBrains Mono" font-size="20" fill="${DIM}">search bluesky, but only the</text>
  <text x="64" y="210" font-family="JetBrains Mono" font-size="20" fill="${DIM}">posts of people you actually know.</text>

  <rect x="64" y="252" width="420" height="52" rx="10" fill="${CARD}" stroke="${BORDER}" stroke-width="1.5"/>
  <circle cx="94" cy="278" r="9" fill="none" stroke="${DIM}" stroke-width="2.5"/>
  <line x1="101" y1="285" x2="110" y2="294" stroke="${DIM}" stroke-width="2.5" stroke-linecap="round"/>
  <text x="122" y="284" font-family="JetBrains Mono" font-size="17" fill="${FG}">"whatever you're looking for"</text>

  <text x="64" y="356" font-family="JetBrains Mono" font-size="14" fill="${CORE}">● core = mutuals, live-crawled</text>
  <text x="64" y="382" font-family="JetBrains Mono" font-size="14" fill="${ADJ}">● adjacent = one-way follows too</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${FG}">simcluster-search.bisks.net</text>

  ${adjSvg}
  ${coreSvg}
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
