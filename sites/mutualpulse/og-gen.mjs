// Generates public/og.png — mutualpulse's Open Graph preview card. Hand-drawn
// SVG (night-sky palette, matching public/style.css), rasterised with
// @resvg/resvg-js. Same recipe as sites/witness/og-gen.mjs.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#070912", INK = "#eceaf6", INK_SOFT = "#9a9bb8", ACCENT = "#e3a857";

// A deterministic little starfield + a handful of category-colored dots,
// same spirit as the real sky in public/style.css.
const DOTS = [
  { x: 860, y: 120, r: 9, c: "#e3a857" },
  { x: 990, y: 210, r: 7, c: "#5aa9e6" },
  { x: 1080, y: 340, r: 8, c: "#e07a9e" },
  { x: 930, y: 420, r: 6, c: "#4fc3a1" },
  { x: 1040, y: 90, r: 6, c: "#9b8cf2" },
  { x: 800, y: 300, r: 7, c: "#d9784f" },
  { x: 1130, y: 470, r: 6, c: "#e3a857" },
  { x: 760, y: 470, r: 5, c: "#5aa9e6" },
];

function stars(n, seed) {
  let s = seed;
  const rand = () => {
    s = (s * 1103515245 + 12345) >>> 0;
    return s / 4294967296;
  };
  let out = "";
  for (let i = 0; i < n; i++) {
    const x = rand() * W;
    const y = rand() * H;
    const r = 0.8 + rand() * 1.1;
    const o = 0.25 + rand() * 0.5;
    out += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" fill="#ffffff" opacity="${o.toFixed(2)}"/>`;
  }
  return out;
}

function dot(d) {
  return `
    <circle cx="${d.x}" cy="${d.y}" r="${d.r * 2.6}" fill="${d.c}" opacity="0.22"/>
    <circle cx="${d.x}" cy="${d.y}" r="${d.r}" fill="${d.c}"/>`;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${BG}"/>
  ${stars(140, 42)}
  ${DOTS.map(dot).join("")}

  <text x="64" y="180" font-family="JetBrains Mono" font-weight="800" font-size="80" fill="${INK}">mutualpulse</text>
  <text x="66" y="222" font-family="JetBrains Mono" font-size="20" fill="${INK_SOFT}">a live pulse-board of mutual aid</text>

  <text x="66" y="288" font-family="JetBrains Mono" font-size="17" fill="${INK_SOFT}">Food shared. Rides given. A fence fixed.</text>
  <text x="66" y="316" font-family="JetBrains Mono" font-size="17" fill="${INK_SOFT}">Someone who just listened. Logged from your</text>
  <text x="66" y="344" font-family="JetBrains Mono" font-size="17" fill="${INK_SOFT}">own Bluesky account, glowing on a shared sky.</text>
  <text x="66" y="392" font-family="JetBrains Mono" font-weight="700" font-size="17" fill="${ACCENT}">No ledger. No amounts. No leaderboard.</text>

  <text x="64" y="586" font-family="JetBrains Mono" font-weight="800" font-size="24" fill="${INK}">mutualpulse.bisks.net</text>
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
