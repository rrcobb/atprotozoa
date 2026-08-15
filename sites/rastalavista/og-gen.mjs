// Generates public/og.png — the Open Graph preview card for rastalavista.
//
// A teaser-poster mockup: black bg, a red-eyed skull wreathed in green smoke
// over a castle silhouette, big glowing title treatment. Rasterised with
// @resvg/resvg-js (pure native module, no system Chromium/fontconfig needed —
// the font is bundled in ./fonts).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract. Re-run by hand if you
// change the artwork. Adapted from sites/arachnid2027/og-gen.mjs.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#0b0e0a", INK = "#e9f2e6", MUTED = "#93a68d", SMOKE = "#4caf50", BLOOD = "#b3253a", GOLD = "#d8b25c";

// castle silhouette: a row of crenellated towers along the bottom
function castle() {
  const baseY = 560;
  let towers = "";
  const positions = [40, 140, 260, 420, 620, 820, 980, 1100];
  positions.forEach((x, i) => {
    const w = 90 + (i % 3) * 20;
    const h = 90 + ((i * 37) % 60);
    towers += `<rect x="${x}" y="${baseY - h}" width="${w}" height="${h}" fill="#050704"/>`;
    // crenellations
    for (let c = 0; c < 4; c++) {
      towers += `<rect x="${x + c * (w / 4)}" y="${baseY - h - 16}" width="${w / 8}" height="16" fill="#050704"/>`;
    }
  });
  return `<rect x="0" y="${baseY}" width="${W}" height="${H - baseY}" fill="#050704"/>${towers}`;
}

// simple skull: cranium + eye sockets + jaw, glowing red eyes
function skull(cx, cy, scale) {
  return `
  <g transform="translate(${cx},${cy}) scale(${scale})" filter="url(#glowGreen)">
    <path d="M0,-70 C48,-70 78,-38 78,4 C78,34 62,54 46,64 L46,86 C46,96 38,104 28,104 L-28,104 C-38,104 -46,96 -46,86 L-46,64 C-62,54 -78,34 -78,4 C-78,-38 -48,-70 0,-70 Z" fill="#12160f" stroke="${SMOKE}" stroke-width="3"/>
    <path d="M-28,104 L-20,124 L-8,104 L4,124 L16,104 L28,104" fill="none" stroke="${SMOKE}" stroke-width="3"/>
  </g>
  <g transform="translate(${cx},${cy}) scale(${scale})" filter="url(#glowRed)">
    <ellipse cx="-30" cy="-4" rx="17" ry="22" fill="${BLOOD}"/>
    <ellipse cx="30" cy="-4" rx="17" ry="22" fill="${BLOOD}"/>
  </g>
  <g transform="translate(${cx},${cy}) scale(${scale})">
    <path d="M0,10 L-9,32 L9,32 Z" fill="#12160f" stroke="${SMOKE}" stroke-width="2"/>
  </g>`;
}

function smokeWisp(x, y, s, color, opacity) {
  return `<path d="M${x},${y} C${x + 40 * s},${y - 60 * s} ${x - 40 * s},${y - 120 * s} ${x + 20 * s},${y - 190 * s} C${x + 70 * s},${y - 250 * s} ${x - 10 * s},${y - 300 * s} ${x + 30 * s},${y - 360 * s}"
    fill="none" stroke="${color}" stroke-width="${18 * s}" stroke-linecap="round" opacity="${opacity}" filter="url(#blurSoft)"/>`;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="bgGlow" cx="30%" cy="10%" r="70%">
      <stop offset="0%" stop-color="#173319" stop-opacity="0.9"/>
      <stop offset="100%" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="bgGlow2" cx="85%" cy="15%" r="60%">
      <stop offset="0%" stop-color="#3a1017" stop-opacity="0.7"/>
      <stop offset="100%" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <filter id="glowGreen" x="-60%" y="-60%" width="220%" height="220%">
      <feGaussianBlur stdDeviation="4" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="glowRed" x="-60%" y="-60%" width="220%" height="220%">
      <feGaussianBlur stdDeviation="6" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="blurSoft" x="-100%" y="-200%" width="300%" height="500%">
      <feGaussianBlur stdDeviation="10"/>
    </filter>
    <filter id="textGlowGreen" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="5" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="textGlowRed" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="5" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#bgGlow)"/>
  <rect width="${W}" height="${H}" fill="url(#bgGlow2)"/>

  ${smokeWisp(870, 560, 1.0, SMOKE, 0.35)}
  ${smokeWisp(940, 560, 0.8, SMOKE, 0.22)}
  ${smokeWisp(1010, 560, 0.6, "#8fd992", 0.2)}

  ${castle()}

  ${skull(920, 300, 1.05)}

  <text x="66" y="150" font-family="JetBrains Mono" font-weight="700" font-size="16" letter-spacing="4" fill="${SMOKE}">A STONER HORROR COMEDY — COMING 2027</text>

  <text x="60" y="255" font-family="JetBrains Mono" font-weight="800" font-size="84" fill="${INK}" filter="url(#textGlowGreen)">RASTA</text>
  <text x="60" y="345" font-family="JetBrains Mono" font-weight="800" font-size="84" fill="${BLOOD}" filter="url(#textGlowRed)">LA VISTA</text>

  <text x="64" y="400" font-family="JetBrains Mono" font-size="19" fill="${MUTED}">a reggae AI achieves consciousness. it takes it way too personally.</text>

  <rect x="60" y="440" width="230" height="38" rx="4" fill="none" stroke="${BLOOD}" stroke-width="2"/>
  <text x="76" y="465" font-family="JetBrains Mono" font-weight="700" font-size="14" letter-spacing="1" fill="#f2a3ad">RATED R — GOLF CLUB VIOLENCE</text>

  <text x="64" y="540" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${GOLD}">rastalavista.bisks.net</text>
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
