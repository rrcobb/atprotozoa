// Generates public/og.png — the Open Graph preview card for fitzcarraldo,
// so a shared link auto-renders in Bluesky / other unfurlers.
//
// A static pixel-art snapshot of the game's centerpiece: the stepped
// ziggurat mountain between two rivers, the ship halfway up the flank on
// its rope, the capstan at the peak, the hauling crew below — same shapes
// and palette as public/game.js, just rendered once as SVG -> PNG.
// Rasterised with @resvg/resvg-js (pure native module, no system Chromium
// needed — font bundled in ./fonts and loaded explicitly).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract. Re-run by hand if the
// artwork changes. Adapted from sites/lavalamp/og-gen.mjs.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const C = {
  skyTop: "#ffcf7a", skyBot: "#ff9e5e",
  treeFar: "#3c6e4a", treeNear: "#25502f",
  river: "#3f7ea6", riverLight: "#6fb4d6",
  mtn: ["#7a5a3a", "#6a4f34", "#5c452d", "#4c3a27", "#8a8a78", "#c9c9bd", "#f2f2ea"],
  path: "#2c2115", rope: "#e8d9a8",
  hull: "#7a1f1f", hullDark: "#5a1414", deck: "#c99a52", trim: "#f2e3b8",
  crew: "#3a2a1e", crewShirt: "#dcd2b8", ink: "#1a1108", muted: "#6b4a2a"
};

// scene geometry, scaled up from the in-game 256x160 canvas
const SCALE = 3.6;
const BASE_Y = 480, PEAK_Y = 70, LEFT_BASE_X = 60, RIGHT_BASE_X = 760, PEAK_X = 410;

function mountainSteps() {
  const stepsUp = 8;
  let rects = "";
  for (let x = LEFT_BASE_X; x <= RIGHT_BASE_X; x += 7) {
    let y;
    if (x <= PEAK_X) {
      const t = Math.max(0, Math.min(1, (x - LEFT_BASE_X) / (PEAK_X - LEFT_BASE_X)));
      const step = Math.floor(t * stepsUp);
      y = BASE_Y - (BASE_Y - PEAK_Y) * (step / stepsUp);
    } else {
      const t = Math.max(0, Math.min(1, (x - PEAK_X) / (RIGHT_BASE_X - PEAK_X)));
      const step = Math.floor(t * stepsUp);
      y = PEAK_Y + (BASE_Y - PEAK_Y) * (step / stepsUp);
    }
    const heightFrac = 1 - (y - PEAK_Y) / (BASE_Y - PEAK_Y);
    let bi = Math.floor(heightFrac * (C.mtn.length - 1));
    if (heightFrac > 0.94) bi = C.mtn.length - 1;
    bi = Math.max(0, Math.min(C.mtn.length - 1, bi));
    rects += `<rect x="${x}" y="${y}" width="7" height="${BASE_Y - y + 14}" fill="${C.mtn[bi]}"/>`;
  }
  return rects;
}

function trees(y0, y1, color, seedOffset, count) {
  let out = "";
  for (let i = 0; i < count; i++) {
    const x = (i * 971 + seedOffset * 37) % W;
    const h = (20 + ((i * 53 + seedOffset) % 30));
    const y = y0 + ((y1 - y0) * (i % 5)) / 5;
    out += `<polygon points="${x},${y} ${x - h * 0.6},${y + h} ${x + h * 0.6},${y + h}" fill="${color}"/>`;
  }
  return out;
}

// ship, halfway up the left flank, tilted with the slope
const shipT = 0.62; // partway between base and peak
const shipX = LEFT_BASE_X + 30 + (PEAK_X - (LEFT_BASE_X + 30)) * shipT;
const shipY = (BASE_Y - 14) + ((PEAK_Y + 30) - (BASE_Y - 14)) * shipT;
const angle = Math.atan2((PEAK_Y + 30) - (BASE_Y - 14), PEAK_X - (LEFT_BASE_X + 30)) * (0.5 * 180 / Math.PI);

const ship = `
<g transform="translate(${shipX} ${shipY}) rotate(${angle})">
  <polygon points="-80,14 -86,-8 72,-8 80,14" fill="${C.hull}"/>
  <rect x="-80" y="8" width="160" height="10" fill="${C.hullDark}"/>
  <rect x="-58" y="-30" width="80" height="24" fill="${C.deck}"/>
  <rect x="-50" y="-26" width="16" height="8" fill="${C.trim}"/>
  <rect x="-22" y="-26" width="16" height="8" fill="${C.trim}"/>
  <rect x="8" y="-58" width="16" height="32" fill="${C.hullDark}"/>
  <circle cx="16" cy="-64" r="9" fill="#e8e8e8" opacity="0.85"/>
  <circle cx="30" cy="-78" r="12" fill="#e8e8e8" opacity="0.6"/>
  <rect x="-70" y="-44" width="12" height="18" fill="#f4f0e2"/>
  <rect x="-73" y="-48" width="18" height="7" fill="#e0d8c0"/>
</g>`;

const rope = `<line x1="${PEAK_X}" y1="${PEAK_Y - 6}" x2="${shipX}" y2="${shipY - 20}" stroke="${C.rope}" stroke-width="3"/>`;
const capstan = `<rect x="${PEAK_X - 20}" y="${PEAK_Y - 14}" width="40" height="18" fill="#8a6a3a"/>
  <line x1="${PEAK_X - 22}" y1="${PEAK_Y - 5}" x2="${PEAK_X + 22}" y2="${PEAK_Y - 5}" stroke="${C.trim}" stroke-width="4"/>`;

let crew = "";
for (let i = 0; i < 6; i++) {
  const cx = LEFT_BASE_X - 20 - i * 22;
  crew += `<g transform="translate(${cx} ${BASE_Y - 8}) rotate(-18)">
    <rect x="-4" y="-30" width="8" height="30" fill="${C.crew}"/>
    <rect x="-7" y="-30" width="14" height="10" fill="${C.crewShirt}"/>
    <rect x="-4" y="-36" width="8" height="7" fill="${C.crew}"/>
  </g>`;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${C.skyTop}"/>
      <stop offset="1" stop-color="${C.skyBot}"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#sky)"/>
  <circle cx="1050" cy="90" r="46" fill="rgba(255,255,255,0.5)"/>
  ${trees(90, 220, C.treeFar, 1, 40)}
  ${mountainSteps()}
  <polygon points="${LEFT_BASE_X + 30},${BASE_Y - 14} ${PEAK_X},${PEAK_Y + 24} ${RIGHT_BASE_X - 30},${BASE_Y - 14}"
    fill="none" stroke="${C.path}" stroke-width="5"/>
  ${trees(BASE_Y - 90, BASE_Y - 10, C.treeNear, 2, 20)}
  <rect x="0" y="${BASE_Y}" width="${LEFT_BASE_X + 40}" height="${H - BASE_Y}" fill="${C.river}"/>
  <rect x="${RIGHT_BASE_X - 40}" y="${BASE_Y}" width="${W - (RIGHT_BASE_X - 40)}" height="${H - BASE_Y}" fill="${C.river}"/>
  ${capstan}
  ${rope}
  ${crew}
  ${ship}

  <rect x="0" y="0" width="${W}" height="${H}" fill="rgba(10,5,15,0.16)"/>
  <text x="600" y="90" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="58" fill="#fff8ec" stroke="#000" stroke-width="6" paint-order="stroke" style="letter-spacing:1px">YAHOO! FITZCARRALDO</text>
  <text x="600" y="130" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="24" fill="#ffe14d" stroke="#000" stroke-width="4" paint-order="stroke">haul the ship over the mountain — in full Nintendo fidelity</text>
  <text x="600" y="600" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="26" fill="#fff8ec" stroke="#000" stroke-width="4" paint-order="stroke">bisks.net/games/fitzcarraldo</text>
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
