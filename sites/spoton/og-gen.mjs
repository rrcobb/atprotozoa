// Generates public/og.png — the Open Graph preview card for spoton.
//
// A static snapshot of the four tasks: a bisected line with a crosshair on
// its center, a 3x3 dot grid with the middle dot picked out, and a little
// jar of beans. Rasterised with @resvg/resvg-js (pure native module, no
// system Chromium/fontconfig needed — the font is bundled in ./fonts and
// loaded explicitly).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// you change the artwork. Adapted from sites/beanjar/og-gen.mjs.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#0a0e14", INK = "#eaf2ff", MUTED = "#7f93b3", ACCENT = "#ff5a4e", ACCENT2 = "#43e5c5";

// tiny seeded RNG so the layout is identical every run
let seed = 42;
const rnd = (a = 1, b = 0) => b + ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * (a - b);

const BEANS = [
  { base: "#8a2332", hi: "#c14b5e" },
  { base: "#caa268", hi: "#e7c98f" },
  { base: "#3a3230", hi: "#5c5250" },
  { base: "#e8ddc4", hi: "#fbf5e6" },
  { base: "#6b3a20", hi: "#9c5c34" },
];

let gid = 0;
function bean(bx, by, r, angle, p) {
  const id = "bg" + gid++;
  const rx = r * 1.15, ry = r * 0.78;
  return `
  <defs>
    <radialGradient id="${id}" cx="35%" cy="30%" r="80%">
      <stop offset="0" stop-color="${p.hi}"/>
      <stop offset="1" stop-color="${p.base}"/>
    </radialGradient>
  </defs>
  <g transform="translate(${bx.toFixed(1)},${by.toFixed(1)}) rotate(${(angle * 57.3).toFixed(1)})">
    <ellipse rx="${rx.toFixed(1)}" ry="${ry.toFixed(1)}" fill="url(#${id})"/>
    <ellipse cx="${(-rx * 0.32).toFixed(1)}" cy="${(-ry * 0.36).toFixed(1)}" rx="${(rx * 0.28).toFixed(1)}" ry="${(ry * 0.18).toFixed(1)}" fill="rgba(255,255,255,0.35)"/>
  </g>`;
}

// --- left panel: bisected line + crosshair ---
const lineX0 = 90, lineX1 = 330, lineY = 150;
const lineMidX = (lineX0 + lineX1) / 2;
const lineSvg = `
  <line x1="${lineX0}" y1="${lineY}" x2="${lineX1}" y2="${lineY}" stroke="${ACCENT2}" stroke-width="4" stroke-linecap="round"/>
  <circle cx="${lineX0}" cy="${lineY}" r="5" fill="${ACCENT2}"/>
  <circle cx="${lineX1}" cy="${lineY}" r="5" fill="${ACCENT2}"/>
  <line x1="${lineMidX - 12}" y1="${lineY}" x2="${lineMidX + 12}" y2="${lineY}" stroke="${ACCENT}" stroke-width="3"/>
  <line x1="${lineMidX}" y1="${lineY - 12}" x2="${lineMidX}" y2="${lineY + 12}" stroke="${ACCENT}" stroke-width="3"/>
`;

// --- middle panel: 3x3 dot grid, center dot picked ---
const gridCx = 210, gridCy = 320, gridGap = 44;
let gridSvg = "";
for (let r = -1; r <= 1; r++) {
  for (let c = -1; c <= 1; c++) {
    const isCenter = r === 0 && c === 0;
    gridSvg += `<circle cx="${gridCx + c * gridGap}" cy="${gridCy + r * gridGap}" r="${isCenter ? 10 : 7}" fill="${isCenter ? ACCENT : ACCENT2}"/>`;
  }
}

// --- right panel: little jar of beans ---
const jarLeft = 90, jarRight = 330, jarTop = 430, jarBottomY = 560, jarR = (jarRight - jarLeft) / 2;
const jarCx = (jarLeft + jarRight) / 2;
let jarBeans = "";
for (let i = 0; i < 18; i++) {
  const t = rnd();
  const y = jarTop + 20 + t * (jarBottomY - jarTop - 10);
  const shrink = 1 - ((y - jarTop) / (jarBottomY - jarTop)) * 0.1;
  const x = jarCx + rnd(-1, 1) * (jarR - 18) * shrink;
  jarBeans += bean(x, y, rnd(8, 11), rnd(6.283), BEANS[(rnd(BEANS.length)) | 0]);
}
const jarPath = `M ${jarLeft} ${jarTop} L ${jarLeft} ${jarBottomY - jarR} A ${jarR} ${jarR} 0 0 0 ${jarRight} ${jarBottomY - jarR} L ${jarRight} ${jarTop} Z`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="backglow1" cx="15%" cy="-5%" r="60%">
      <stop offset="0" stop-color="#1a0f0d"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="backglow2" cx="95%" cy="100%" r="55%">
      <stop offset="0" stop-color="#0d1f1c"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <clipPath id="jarclip">
      <path d="${jarPath}"/>
    </clipPath>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#backglow1)"/>
  <rect width="${W}" height="${H}" fill="url(#backglow2)"/>

  <rect x="60" y="70" width="330" height="530" rx="18" fill="#141b28" stroke="#233047" stroke-width="1.5"/>
  <text x="225" y="105" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="16" fill="${MUTED}">bisect the line</text>
  ${lineSvg}
  <text x="225" y="270" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="16" fill="${MUTED}">find the middle dot</text>
  ${gridSvg}
  <text x="225" y="405" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="16" fill="${MUTED}">how many beans?</text>
  <g clip-path="url(#jarclip)">${jarBeans}</g>
  <path d="${jarPath}" fill="none" stroke="rgba(255,255,255,0.22)" stroke-width="2.5"/>

  <g transform="translate(450,170)">
    <circle cx="0" cy="0" r="26" fill="none" stroke="${ACCENT}" stroke-width="5"/>
    <circle cx="0" cy="0" r="13" fill="none" stroke="${ACCENT}" stroke-width="4"/>
    <circle cx="0" cy="0" r="4" fill="${ACCENT}"/>
    <line x1="-38" y1="0" x2="-30" y2="0" stroke="${ACCENT}" stroke-width="5"/>
    <line x1="30" y1="0" x2="38" y2="0" stroke="${ACCENT}" stroke-width="5"/>
    <line x1="0" y1="-38" x2="0" y2="-30" stroke="${ACCENT}" stroke-width="5"/>
    <line x1="0" y1="30" x2="0" y2="38" stroke="${ACCENT}" stroke-width="5"/>
  </g>
  <text x="500" y="200" font-family="JetBrains Mono" font-weight="800" font-size="60" fill="${INK}">spot on</text>
  <text x="450" y="250" font-family="JetBrains Mono" font-size="20" fill="${MUTED}">four fast tests of your</text>
  <text x="450" y="280" font-family="JetBrains Mono" font-size="20" fill="${MUTED}">spatial eyeball</text>

  <text x="450" y="340" font-family="JetBrains Mono" font-size="19" fill="${ACCENT}">bisect a line</text>
  <text x="450" y="376" font-family="JetBrains Mono" font-size="19" fill="${MUTED}">find the middle dot</text>
  <text x="450" y="412" font-family="JetBrains Mono" font-size="19" fill="${MUTED}">guess the bean count</text>
  <text x="450" y="448" font-family="JetBrains Mono" font-size="19" fill="${MUTED}">drag a box over the right number</text>

  <text x="450" y="560" font-family="JetBrains Mono" font-weight="700" font-size="24" fill="${ACCENT2}">bisks.net/games/spoton</text>
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
