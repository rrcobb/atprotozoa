// Generates public/og.png — the Open Graph preview card for cancrusher.
//
// A hand-drawn SVG "screenshot": a crumpled aluminum can silhouette (a
// jagged polygon, not a clean cylinder, so it reads as already-crushed) with
// a tilted hydraulic press plate resting on top, plus a mock "physically
// accurate" readout panel echoing the live page's HUD. Static and
// deterministic — no network, no live sim state — same approach as
// sites/beatupbuddy/og-gen.mjs. Rasterised with @resvg/resvg-js (pure native
// module, font bundled in ./fonts, no system fontconfig needed).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const INK = "#eef4f2", MUTED = "#8fa3a8", RED = "#ff4433", GOLD = "#ffd23f";
const METAL = "#cdd6d8", METAL_DARK = "#7c898d", METAL_STROKE = "#4d565a";

const ax = 900, ay = 566; // crumpled can floor anchor

// hand-placed jagged outline — a wrinkled cylinder, not a clean rectangle,
// so the static card reads as "already crushed" rather than "about to be."
const canPoints = [
  [ax - 66, ay], [ax - 80, ay - 55], [ax - 52, ay - 82], [ax - 88, ay - 128],
  [ax - 38, ay - 156], [ax - 92, ay - 202], [ax - 28, ay - 228], [ax - 58, ay - 266],
  [ax + 54, ay - 264], [ax + 34, ay - 226], [ax + 96, ay - 200], [ax + 42, ay - 158],
  [ax + 90, ay - 130], [ax + 48, ay - 84], [ax + 84, ay - 56], [ax + 66, ay],
];
const canPath = "M " + canPoints.map((p) => p.join(" ")).join(" L ") + " Z";

// label band: a jagged sub-slice of the same outline, roughly the middle third
const bandPoints = [
  [ax - 88, ay - 128], [ax - 38, ay - 156], [ax - 92, ay - 202], [ax - 28, ay - 228],
  [ax + 34, ay - 226], [ax + 96, ay - 200], [ax + 42, ay - 158], [ax + 90, ay - 130],
];
const bandPath = "M " + bandPoints.map((p) => p.join(" ")).join(" L ") + " Z";

// tilted press plate resting on the lopsided crush, hazard-striped
const plateCx = ax + 6, plateCy = ay - 282, plateAngle = -7;
const plateW = 210, plateH = 26;
let stripes = "";
for (let x = -plateW; x < plateW; x += 22) {
  stripes += `<line x1="${x}" y1="${-plateH}" x2="${x + plateH * 2}" y2="${plateH}" stroke="${GOLD}" stroke-width="7"/>`;
}
const plate = `
  <g transform="translate(${plateCx} ${plateCy}) rotate(${plateAngle})">
    <rect x="${-6}" y="${-plateH / 2 - 70}" width="12" height="70" fill="#2c3336"/>
    <clipPath id="plateClip"><rect x="${-plateW / 2}" y="${-plateH / 2}" width="${plateW}" height="${plateH}" rx="4"/></clipPath>
    <rect x="${-plateW / 2}" y="${-plateH / 2}" width="${plateW}" height="${plateH}" rx="4" fill="#454e52"/>
    <g clip-path="url(#plateClip)">${stripes}</g>
    <rect x="${-plateW / 2}" y="${-plateH / 2}" width="${plateW}" height="${plateH}" rx="4" fill="none" stroke="#1b2124" stroke-width="2.5"/>
  </g>`;

const readoutRows = [
  ["INTERNAL PRESSURE", "471 kPa", GOLD],
  ["BUCKLING MODE", "asymmetric", GOLD],
  ["PEAK FORCE", "1120 N", RED],
];
let readout = "";
readoutRows.forEach(([label, value, color], i) => {
  const y = 214 + i * 40;
  readout += `<text x="80" y="${y}" font-family="JetBrains Mono" font-weight="600" font-size="19" fill="${MUTED}">${label}</text>
    <text x="500" y="${y}" text-anchor="end" font-family="JetBrains Mono" font-weight="800" font-size="19" fill="${color}">${value}</text>`;
});

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow" cx="0.28" cy="0.05" r="0.9">
      <stop offset="0" stop-color="#1e2c30"/>
      <stop offset="1" stop-color="#10161a"/>
    </radialGradient>
    <linearGradient id="metal" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${METAL_DARK}"/>
      <stop offset="0.3" stop-color="#eef3f4"/>
      <stop offset="0.6" stop-color="${METAL}"/>
      <stop offset="1" stop-color="${METAL_DARK}"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>

  <text x="60" y="120" font-family="JetBrains Mono" font-weight="800" font-size="60" fill="${INK}">CAN<tspan fill="${RED}">CRUSHER</tspan></text>
  <text x="60" y="160" font-family="JetBrains Mono" font-weight="600" font-size="23" fill="${MUTED}">a physically-ish accurate soda can crushing simulator</text>

  <rect x="56" y="188" width="470" height="150" rx="12" fill="#182024" stroke="#2c3a40" stroke-width="2"/>
  ${readout}

  <text x="60" y="410" font-family="JetBrains Mono" font-size="20" fill="${MUTED}">drag the plate down. it buckles wherever it wants to.</text>
  <text x="60" y="${H - 46}" font-family="JetBrains Mono" font-weight="700" font-size="24" fill="${RED}">cancrusher.bisks.net</text>

  <ellipse cx="${ax}" cy="${ay + 8}" rx="110" ry="16" fill="#000" opacity="0.35"/>
  <path d="${canPath}" fill="url(#metal)" stroke="${METAL_STROKE}" stroke-width="3"/>
  <path d="${bandPath}" fill="${RED}" opacity="0.85"/>
  ${plate}
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
