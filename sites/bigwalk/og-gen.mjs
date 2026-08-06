// Generates public/og.png — the Open Graph preview card for bigwalk.
//
// Hand-drawn SVG at the canonical OG size: a day-lit track with a row of
// walkers mid-stride, headed for a finish line. Rasterised with
// @resvg/resvg-js (pure native module, no system Chromium/fontconfig
// needed — the font is bundled in ./fonts and loaded explicitly).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// you change the artwork. Adapted from sites/gridlock/og-gen.mjs.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const SKY_TOP = "#cdeaff", SKY_BOTTOM = "#eafff0";
const INK = "#1a2b22", MUTED = "#5c6f63", AMBER = "#ff9b3d", TAIL = "#ff5d5d", ACCENT = "#1f9d63";
const TRACK = "#d7f3df";

// Bottom third: a track with lane dashes and a row of walkers mid-stride,
// closing in on a checkered finish line. Figures carry generic dot faces
// (the real walk draws real avatars, client-side).
const trackY = 430;
const walkerY = trackY + 40;
const walkerGap = 150;
const nWalkers = 7;
let walkers = "";
for (let i = 0; i < nWalkers; i++) {
  const x = 60 + i * walkerGap;
  const isYou = i === 2;
  const body = isYou ? AMBER : ["#c9c1d8", "#e5b8a8", "#9fd6c9", "#d8c98f"][i % 4];
  const lean = i % 2 === 0 ? -6 : 6;
  walkers += `
    <g transform="translate(${x} ${walkerY}) rotate(${lean})">
      <circle cx="0" cy="-46" r="16" fill="${body}"/>
      <rect x="-10" y="-30" width="20" height="34" rx="8" fill="${body}"/>
      <rect x="-16" y="4" width="10" height="26" rx="4" fill="${INK}" opacity="0.75"/>
      <rect x="6" y="4" width="10" height="26" rx="4" fill="${INK}" opacity="0.5"/>
    </g>`;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${SKY_TOP}"/>
      <stop offset="1" stop-color="${SKY_BOTTOM}"/>
    </linearGradient>
    <radialGradient id="sun" cx="82%" cy="10%" r="45%">
      <stop offset="0" stop-color="${AMBER}" stop-opacity="0.35"/>
      <stop offset="1" stop-color="${AMBER}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#sky)"/>
  <rect width="${W}" height="${H}" fill="url(#sun)"/>

  <text x="60" y="150" font-family="JetBrains Mono" font-weight="800" font-size="60" fill="${INK}">big<tspan fill="${ACCENT}">walk</tspan></text>
  <text x="62" y="192" font-family="JetBrains Mono" font-size="21" fill="${MUTED}">race your moots, live</text>

  <text x="62" y="252" font-family="JetBrains Mono" font-size="17" fill="${MUTED}">Type a handle, race your mutuals down a real-time track —</text>
  <text x="62" y="278" font-family="JetBrains Mono" font-size="17" fill="${MUTED}">alternate left/right to walk, or get picked off the pack.</text>

  <text x="62" y="336" font-family="JetBrains Mono" font-size="16" fill="${ACCENT}">alternate · race · get picked off</text>

  <text x="62" y="600" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${AMBER}">bigwalk.bisks.net</text>

  <rect x="0" y="${trackY}" width="${W}" height="${H - trackY}" fill="${TRACK}"/>
  <rect x="0" y="${trackY}" width="${W}" height="6" fill="#1a2b2222"/>
  ${Array.from({ length: 16 }, (_, i) => `<rect x="${i * 76 + 10}" y="${walkerY + 40}" width="34" height="6" fill="#ffffffa0"/>`).join("")}

  <g transform="translate(${W - 70} ${trackY})">
    <rect x="0" y="0" width="14" height="${H - trackY}" fill="${INK}"/>
    ${Array.from({ length: 6 }, (_, r) =>
      Array.from({ length: 4 }, (_, c) => (r + c) % 2 === 0
        ? `<rect x="${c * 3.5}" y="${r * 15}" width="3.5" height="15" fill="#fff"/>`
        : ""
      ).join("")
    ).join("")}
  </g>

  ${walkers}
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
