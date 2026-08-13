// Generates public/og.png — the Open Graph preview card for beanjar2.
//
// A static snapshot of the jar: same glass-jar silhouette + lid the live page
// draws, filled with a scattering of speckled bean ellipses in the "dried
// beans" palette. Rasterised with @resvg/resvg-js (pure native module, no
// system Chromium/fontconfig needed — the font is bundled in ./fonts and
// loaded explicitly).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// you change the artwork. Adapted from sites/lavalamp/og-gen.mjs.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#100c08", INK = "#f5ecdd", MUTED = "#ab9a84", ACCENT = "#e8a23d";

// tiny seeded RNG so the layout is identical every run
let seed = 7;
const rnd = (a = 1, b = 0) => b + ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * (a - b);

const BEANS = [
  { base: "#8a2332", hi: "#c14b5e", speck: null },
  { base: "#caa268", hi: "#e7c98f", speck: "#8a6a3d" },
  { base: "#231f1e", hi: "#413a38", speck: null },
  { base: "#e8ddc4", hi: "#fbf5e6", speck: "#a89572" },
  { base: "#6b3a20", hi: "#9c5c34", speck: "#3f2313" },
];

const cx = 330, cavLeft = 150, cavRight = 510, cavHalfW = (cavRight - cavLeft) / 2;
const cavTop = 190, cavBottomCenterY = 500, cavBottomR = cavHalfW;

let gid = 0;
function bean(bx, by, r, angle, p) {
  const id = "bg" + gid++;
  const rx = r * 1.3, ry = r * 0.9;
  const speck = p.speck
    ? Array.from({ length: 4 }, (_, i) => {
        const a = (i / 4) * 6.283 + bx;
        return `<circle cx="${(Math.cos(a) * rx * 0.5).toFixed(1)}" cy="${(Math.sin(a) * ry * 0.5).toFixed(1)}" r="1.6" fill="${p.speck}"/>`;
      }).join("")
    : "";
  return `
  <defs>
    <radialGradient id="${id}" cx="35%" cy="30%" r="80%">
      <stop offset="0" stop-color="${p.hi}"/>
      <stop offset="1" stop-color="${p.base}"/>
    </radialGradient>
  </defs>
  <g transform="translate(${bx.toFixed(1)},${by.toFixed(1)}) rotate(${(angle * 57.3).toFixed(1)})">
    <ellipse cx="1.5" cy="2.5" rx="${rx.toFixed(1)}" ry="${ry.toFixed(1)}" fill="rgba(0,0,0,0.25)"/>
    <ellipse rx="${rx.toFixed(1)}" ry="${ry.toFixed(1)}" fill="url(#${id})"/>
    ${speck}
    <ellipse cx="${(-rx * 0.32).toFixed(1)}" cy="${(-ry * 0.36).toFixed(1)}" rx="${(rx * 0.28).toFixed(1)}" ry="${(ry * 0.18).toFixed(1)}" fill="rgba(255,255,255,0.35)"/>
  </g>`;
}

const beansSvg = Array.from({ length: 46 }, () => {
  const t = rnd();
  const y = cavTop + 30 + t * (cavBottomCenterY + cavBottomR - cavTop - 60);
  const spread = cavHalfW - 20 - (y > cavBottomCenterY ? ((y - cavBottomCenterY) / cavBottomR) * 40 : 0);
  const x = cx + rnd(-spread, spread);
  return bean(x, y, rnd(9, 13), rnd(6.283), BEANS[(rnd(BEANS.length)) | 0]);
}).join("");

const clipId = "jarclip";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="backglow" cx="27%" cy="45%" r="70%">
      <stop offset="0" stop-color="#2a1d10"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="glass" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="rgba(210,225,220,0.16)"/>
      <stop offset="0.16" stop-color="rgba(255,255,255,0.05)"/>
      <stop offset="0.5" stop-color="rgba(180,200,195,0.05)"/>
      <stop offset="0.84" stop-color="rgba(255,255,255,0.05)"/>
      <stop offset="1" stop-color="rgba(210,225,220,0.16)"/>
    </linearGradient>
    <clipPath id="${clipId}">
      <path d="M ${cavLeft} ${cavTop} L ${cavLeft} ${cavBottomCenterY} A ${cavBottomR} ${cavBottomR} 0 0 0 ${cavRight} ${cavBottomCenterY} L ${cavRight} ${cavTop} Z"/>
    </clipPath>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#backglow)"/>

  <ellipse cx="${cx}" cy="${cavBottomCenterY + cavBottomR + 20}" rx="${cavHalfW * 0.9}" ry="18" fill="rgba(0,0,0,0.35)"/>

  <path d="M ${cavLeft} ${cavTop} L ${cavLeft} ${cavBottomCenterY} A ${cavBottomR} ${cavBottomR} 0 0 0 ${cavRight} ${cavBottomCenterY} L ${cavRight} ${cavTop} Z" fill="url(#glass)"/>

  <g clip-path="url(#${clipId})">
    ${beansSvg}
  </g>

  <path d="M ${cavLeft} ${cavTop} L ${cavLeft} ${cavBottomCenterY} A ${cavBottomR} ${cavBottomR} 0 0 0 ${cavRight} ${cavBottomCenterY} L ${cavRight} ${cavTop} Z"
    fill="none" stroke="rgba(255,255,255,0.22)" stroke-width="2.5"/>

  <!-- neck + lid -->
  <path d="M ${cavLeft} ${cavTop - 30} Q ${cavLeft} ${cavTop - 70} ${cx - 74} ${cavTop - 70} L ${cx - 74} ${cavTop - 82} L ${cx + 74} ${cavTop - 82} L ${cx + 74} ${cavTop - 70} Q ${cavRight} ${cavTop - 70} ${cavRight} ${cavTop - 30}"
    fill="rgba(200,220,215,0.10)" stroke="rgba(255,255,255,0.2)" stroke-width="1.5"/>
  <rect x="${cx - 82}" y="${cavTop - 112}" width="164" height="34" rx="7" fill="#a89878"/>
  <rect x="${cx - 82}" y="${cavTop - 112}" width="164" height="34" rx="7" fill="none" stroke="rgba(0,0,0,0.3)"/>

  <!-- label -->
  <rect x="${cx - 100}" y="${cavBottomCenterY - 76}" width="200" height="52" rx="6" fill="#e9dcbd" opacity="0.92"/>
  <text x="${cx}" y="${cavBottomCenterY - 42}" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="20" fill="#7a5a28">dried beans</text>

  <!-- wordmark -->
  <text x="630" y="220" font-family="JetBrains Mono" font-weight="800" font-size="58" fill="${INK}">beanjar 2</text>
  <text x="630" y="262" font-family="JetBrains Mono" font-size="19" fill="${MUTED}">same real physics + sound,</text>
  <text x="630" y="290" font-family="JetBrains Mono" font-size="19" fill="${MUTED}">now with a beandex</text>

  <text x="630" y="352" font-family="JetBrains Mono" font-size="18" fill="${ACCENT}">max the heat meter to catch a bean</text>
  <text x="630" y="386" font-family="JetBrains Mono" font-size="18" fill="${MUTED}">20 species, 5 rarities</text>
  <text x="630" y="420" font-family="JetBrains Mono" font-size="18" fill="${MUTED}">one mythic</text>
  <text x="630" y="454" font-family="JetBrains Mono" font-size="18" fill="${MUTED}">every clack synthesized live</text>
  <text x="630" y="488" font-family="JetBrains Mono" font-size="18" fill="${MUTED}">— no sample files, ever</text>

  <text x="630" y="560" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${ACCENT}">beanjar2.bisks.net</text>
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
