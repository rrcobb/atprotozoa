// Generates public/og.png — the Open Graph preview card for pfpyoyo.
// Hand-drawn SVG rasterised with @resvg/resvg-js (pure native module, no
// system Chromium/fontconfig needed — font is bundled in ./fonts).
//
//   node og-gen.mjs   # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract (copied from
// sites/didscope/og-gen.mjs and adapted). Re-run by hand if the artwork changes.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#0a0c12", FG = "#eef0f6", DIM = "#8b92a8";
const ACCENT = "#ff5fa8", ACCENT2 = "#5fd4ff", CARD = "#151926", BORDER = "#262c40";

// Three concentric rings standing in for the yoyo zoom, growing outward —
// a static hint of the live animation's in/out scaling.
const rings = [
  { r: 150, o: 1, sw: 3 },
  { r: 195, o: 0.6, sw: 2.5 },
  { r: 235, o: 0.32, sw: 2 },
];

const ringSvg = rings
  .map((rg) => `<circle cx="900" cy="315" r="${rg.r}" fill="none" stroke="${ACCENT2}" stroke-opacity="${rg.o}" stroke-width="${rg.sw}" stroke-dasharray="10 9"/>`)
  .join("\n  ");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="15%" cy="0%" r="60%">
      <stop offset="0" stop-color="#23163a"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="90%" cy="10%" r="55%">
      <stop offset="0" stop-color="#0e2a38"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${ACCENT}"/>
      <stop offset="1" stop-color="${ACCENT2}"/>
    </linearGradient>
    <radialGradient id="pfpFill" cx="35%" cy="30%" r="75%">
      <stop offset="0" stop-color="#3a2d55"/>
      <stop offset="1" stop-color="#1c1530"/>
    </radialGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>
  <rect width="${W}" height="${H}" fill="url(#glow2)"/>

  <text x="64" y="150" font-family="JetBrains Mono" font-weight="800" font-size="66" fill="url(#title)">pfpyoyo</text>
  <text x="64" y="205" font-family="JetBrains Mono" font-size="22" fill="${DIM}">a pfp, zoomed in and out</text>
  <text x="66" y="234" font-family="JetBrains Mono" font-size="22" fill="${DIM}">forever &#8212; </text>
  <text x="230" y="234" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${ACCENT2}">steadily accelerating</text>
  <text x="64" y="292" font-family="JetBrains Mono" font-size="17" fill="${DIM}">until it hits a singularity and resets.</text>
  <text x="64" y="320" font-family="JetBrains Mono" font-size="17" fill="${DIM}">bring your own handle, or watch the demo.</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${ACCENT2}">pfpyoyo.bisks.net</text>

  ${ringSvg}
  <circle cx="900" cy="315" r="112" fill="url(#pfpFill)" stroke="${BORDER}" stroke-width="2"/>
  <circle cx="862" cy="278" r="34" fill="#4a3d68"/>
  <circle cx="900" cy="360" r="52" fill="#4a3d68"/>
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
