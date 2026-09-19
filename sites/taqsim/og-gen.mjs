// Generates public/og.png — the Open Graph preview card for taqsim.
// Same recipe as sites/receipts/og-gen.mjs and sites/didscope/og-gen.mjs:
// hand-drawn SVG at the canonical OG size, rasterised with @resvg/resvg-js
// (no system Chromium needed, no fontconfig on this box either — the font
// is bundled in ./fonts and loaded explicitly).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#100b08", FG = "#f6ecdf", DIM = "#c9ab86";
const ACCENT = "#e8a24a", ACCENT2 = "#d9663b";

// Overlapping arcs standing in for overlapping drone voices — concentric,
// staggered, fading outward, warm amber against the dark ground.
const cx = 900, cy = 315;
const arcs = Array.from({ length: 9 }, (_, i) => {
  const r = 60 + i * 42;
  const hue = 28 + i * 5;
  const opacity = 0.5 - i * 0.045;
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="hsla(${hue},75%,60%,${opacity})" stroke-width="${10 - i * 0.7}"/>`;
}).join("\n  ");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow" cx="70%" cy="45%" r="65%">
      <stop offset="0" stop-color="#3a2408"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${ACCENT}"/>
      <stop offset="1" stop-color="${ACCENT2}"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  ${arcs}

  <text x="64" y="150" font-family="JetBrains Mono" font-weight="800" font-size="76" fill="url(#title)">taqsim</text>
  <text x="64" y="210" font-family="JetBrains Mono" font-size="22" fill="${DIM}">a generative, Eno-sense taqsim</text>

  <text x="64" y="300" font-family="JetBrains Mono" font-size="18" fill="${FG}">overlapping drones in a maqam of your choosing,</text>
  <text x="64" y="332" font-family="JetBrains Mono" font-size="18" fill="${FG}">shaped by semi-random envelopes so it never</text>
  <text x="64" y="364" font-family="JetBrains Mono" font-size="18" fill="${FG}">repeats, under a randomly-chosen dumbek backing.</text>

  <text x="64" y="440" font-family="JetBrains Mono" font-size="16" fill="${ACCENT}">rast · bayati · hijaz · kurd · nahawand · ajam · saba</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${DIM}">taqsim.bisks.net</text>
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
