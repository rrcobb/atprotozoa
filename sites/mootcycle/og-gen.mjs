// Generates public/og.png — the Open Graph preview card for mootcycle.
// A static snapshot of the game's core moment: the bike mid-jump over a
// crest, leaning back (nose up) the way holding gas too long airborne
// rotates you — same palette and silhouette style as public/game.js,
// rendered once as SVG -> PNG. Rasterised with @resvg/resvg-js (pure
// native module, no system Chromium needed — font bundled in ./fonts and
// loaded explicitly).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract. Re-run by hand if the
// artwork changes. Adapted from sites/fitzcarraldo/og-gen.mjs.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const C = {
  skyTop: "#241a3d", skyMid: "#4a2f5c", skyBot: "#d97b4a",
  sun: "#ffce7a", hillFar: "#2c2044", hillNear: "#17112a",
  ink: "#f5efe4", muted: "#b9aecb", accent: "#ffb454",
  accent2: "#7fe0c8", warn: "#ff6f6f",
};

const GROUND_BASE = 430;
function hillY(x) {
  return (
    GROUND_BASE +
    Math.sin((x - 40) * 0.0034 + 0.6) * 66 +
    Math.sin(x * 0.0082 + 2.1) * 30 +
    Math.sin(x * 0.019 + 4.4) * 13
  );
}
function farY(x) {
  return GROUND_BASE - 90 + Math.sin(x * 0.0022 + 1.2) * 40;
}
function hillPath(fn, step) {
  let d = `M0,${H} L0,${fn(0).toFixed(1)}`;
  for (let x = 0; x <= W; x += step) d += ` L${x},${fn(x).toFixed(1)}`;
  d += ` L${W},${H} Z`;
  return d;
}
function ridgeLine(fn, step) {
  let d = `M0,${fn(0).toFixed(1)}`;
  for (let x = 0; x <= W; x += step) d += ` L${x},${fn(x).toFixed(1)}`;
  return d;
}

// bike, airborne mid-jump, nose leaned back over the crest near x=430
const bikeX = 430, bikeY = hillY(bikeX) - 150;
const leanDeg = -26; // nose up
const WB = 92, WR = 24;

function wheel(cx, cy, r) {
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#0e0a18" stroke="${C.ink}" stroke-width="5"/>
    <line x1="${cx - r + 4}" y1="${cy}" x2="${cx + r - 4}" y2="${cy}" stroke="${C.muted}" stroke-width="2.5"/>
    <line x1="${cx}" y1="${cy - r + 4}" x2="${cx}" y2="${cy + r - 4}" stroke="${C.muted}" stroke-width="2.5"/>`;
}

const bike = `
<g transform="translate(${bikeX} ${bikeY}) rotate(${leanDeg})">
  ${wheel(-WB / 2, 0, WR)}
  ${wheel(WB / 2, 0, WR)}
  <path d="M${-WB / 2},0 L14,-14 L${WB / 2},0" stroke="${C.ink}" stroke-width="8" fill="none" stroke-linecap="round"/>
  <line x1="0" y1="-12" x2="18" y2="-52" stroke="${C.accent}" stroke-width="10" stroke-linecap="round"/>
  <line x1="${WB / 2 - 8}" y1="-4" x2="${WB / 2 - 4}" y2="-32" stroke="${C.ink}" stroke-width="6" stroke-linecap="round"/>
  <line x1="18" y1="-46" x2="${WB / 2 - 6}" y2="-30" stroke="${C.accent}" stroke-width="7" stroke-linecap="round"/>
  <circle cx="24" cy="-64" r="21" fill="${C.accent2}" stroke="${C.ink}" stroke-width="4"/>
  <path d="M26,-62 a13,13 0 0 1 13,13 l-26,0 a13,13 0 0 1 13,-13 Z" fill="rgba(20,15,30,0.55)"/>
</g>`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${C.skyTop}"/>
      <stop offset="0.55" stop-color="${C.skyMid}"/>
      <stop offset="1" stop-color="${C.skyBot}"/>
    </linearGradient>
    <radialGradient id="sunGlow" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="rgba(255,206,122,0.55)"/>
      <stop offset="1" stop-color="rgba(255,206,122,0)"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#sky)"/>
  <circle cx="920" cy="150" r="230" fill="url(#sunGlow)"/>
  <circle cx="920" cy="150" r="96" fill="${C.sun}"/>

  <path d="${hillPath(farY, 20)}" fill="${C.hillFar}"/>
  <path d="${hillPath(hillY, 12)}" fill="${C.hillNear}"/>
  <path d="${ridgeLine(hillY, 12)}" stroke="${C.accent2}" stroke-width="3" fill="none" opacity="0.55"/>

  ${bike}

  <rect x="0" y="0" width="${W}" height="${H}" fill="rgba(10,5,15,0.1)"/>
  <text x="600" y="118" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="72" fill="${C.ink}" stroke="#0e0a18" stroke-width="7" paint-order="stroke" style="letter-spacing:1px">moot<tspan fill="${C.accent}">cycle</tspan></text>
  <text x="600" y="164" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="25" fill="${C.accent2}" stroke="#0e0a18" stroke-width="4" paint-order="stroke">lean back, lean forward, don't faceplant</text>
  <text x="600" y="600" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="26" fill="${C.ink}" stroke="#0e0a18" stroke-width="4" paint-order="stroke">bisks.net/games/mootcycle</text>
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
