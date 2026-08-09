// Generates public/og.png — the Open Graph preview card for duckfile.
//
// Hand-drawn "TRON grid meets frutiger aero" SVG at the canonical OG size,
// rasterised with @resvg/resvg-js (pure native module, no system Chromium
// needed — this box has no fontconfig/system fonts either, so the font is
// bundled in ./fonts and loaded explicitly).
// Copied from infrasound/og-gen.mjs (copy, don't abstract).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// No live data, no network — deterministic so the card is stable across
// builds.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

const W = 1200, H = 630;
const BG = "#050810";
const GRID = "rgba(56,226,255,0.16)";
const CYAN = "#2ce8ff";
const CYAN_SOFT = "#8ff5ff";
const ORANGE = "#ff8a3d";
const AMBER = "#ffd166";
const AMBER_BRIGHT = "#ffe49a";
const GLASS = "rgba(13,30,48,0.82)";
const INK = "#eafdff";
const INK_DIM = "#9fd0e0";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// grid floor, evenly spaced lines across the whole card
let grid = "";
for (let x = 0; x <= W; x += 48) grid += `<line x1="${x}" y1="0" x2="${x}" y2="${H}" stroke="${GRID}" stroke-width="1"/>`;
for (let y = 0; y <= H; y += 48) grid += `<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="${GRID}" stroke-width="1"/>`;

function node(x, y, w, h, label, sub, accent) {
  return `
  <g filter="url(#glow)">
    <rect x="${x - w / 2}" y="${y - h / 2}" width="${w}" height="${h}" rx="8" fill="${GLASS}" stroke="${accent}" stroke-width="1.5"/>
  </g>
  <g>
    <circle cx="${x}" cy="${y - h / 2}" r="5" fill="${AMBER_BRIGHT}" filter="url(#glow)"/>
    <text x="${x}" y="${y - 2}" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="15" fill="${INK}">${esc(label)}</text>
    ${sub ? `<text x="${x}" y="${y + 16}" text-anchor="middle" font-family="JetBrains Mono" font-size="11" fill="${INK_DIM}">${esc(sub)}</text>` : ""}
  </g>`;
}

const nA = { x: 205, y: 150 };
const nB = { x: 470, y: 260 };
const nC = { x: 205, y: 340 };
const nD = { x: 430, y: 100 };

const svg = `
<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="glow" x="-60%" y="-60%" width="220%" height="220%">
      <feGaussianBlur stdDeviation="3.2" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
    <radialGradient id="bloomCyan" cx="20%" cy="0%" r="60%">
      <stop offset="0%" stop-color="${CYAN}" stop-opacity="0.28"/>
      <stop offset="100%" stop-color="${CYAN}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="bloomOrange" cx="90%" cy="10%" r="55%">
      <stop offset="0%" stop-color="${ORANGE}" stop-opacity="0.22"/>
      <stop offset="100%" stop-color="${ORANGE}" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  ${grid}
  <rect width="${W}" height="${H}" fill="url(#bloomCyan)"/>
  <rect width="${W}" height="${H}" fill="url(#bloomOrange)"/>

  <!-- grid-board cluster, left two-thirds -->
  <path d="M${nA.x},${nA.y} Q ${(nA.x+nB.x)/2+20},${(nA.y+nB.y)/2} ${nB.x},${nB.y}" fill="none" stroke="${CYAN}" stroke-width="2.5" opacity="0.85" filter="url(#glow)"/>
  <path d="M${nC.x},${nC.y} Q ${(nC.x+nB.x)/2-10},${(nC.y+nB.y)/2+10} ${nB.x},${nB.y}" fill="none" stroke="${ORANGE}" stroke-width="2.5" opacity="0.85" filter="url(#glow)"/>
  <path d="M${nA.x},${nA.y} Q ${(nA.x+nD.x)/2},${(nA.y+nD.y)/2-20} ${nD.x},${nD.y}" fill="none" stroke="${CYAN}" stroke-width="2.5" opacity="0.85" filter="url(#glow)"/>
  <path d="M${nD.x},${nD.y} Q ${(nD.x+nB.x)/2+10},${(nD.y+nB.y)/2} ${nB.x},${nB.y}" fill="none" stroke="${ORANGE}" stroke-width="2.5" opacity="0.85" filter="url(#glow)"/>

  ${node(nA.x, nA.y, 170, 62, "norvid-studies", "requester, allegedly the victim", CYAN)}
  ${node(nB.x, nB.y, 170, 62, "the algorithm", "shows them to each other", ORANGE)}
  ${node(nC.x, nC.y, 170, 62, "$BRKTHRU", "not a real token (yet)", CYAN)}
  ${node(nD.x, nD.y, 170, 62, "croissanthology.com", "rendered as a duck", ORANGE)}

  <!-- wireframe duck, near the croissanthology node -->
  <g transform="translate(${nD.x + 110}, ${nD.y + 2})" filter="url(#glow)">
    <ellipse cx="0" cy="6" rx="20" ry="13" fill="none" stroke="${AMBER}" stroke-width="2"/>
    <circle cx="-14" cy="-8" r="9" fill="none" stroke="${AMBER}" stroke-width="2"/>
    <path d="M-22,-8 L-32,-6 L-22,-4 Z" fill="${AMBER}"/>
    <circle cx="-16" cy="-10" r="1.4" fill="${AMBER}"/>
  </g>

  <!-- right side: title block on a glass HUD panel -->
  <g>
    <rect x="600" y="90" width="560" height="450" rx="16" fill="${GLASS}" stroke="${CYAN}" stroke-width="1.5" filter="url(#glow)"/>
    <rect x="600" y="90" width="560" height="140" rx="16" fill="url(#bloomCyan)" opacity="0.6"/>
    <text x="640" y="175" font-family="JetBrains Mono" font-weight="700" font-size="17" fill="${CYAN_SOFT}" letter-spacing="2">DECLASSIFIED — AT MAXIMUM HYPE</text>
    <text x="640" y="252" font-family="JetBrains Mono" font-weight="900" font-size="64" fill="${INK}">THE DUCK</text>
    <text x="640" y="318" font-family="JetBrains Mono" font-weight="900" font-size="56" fill="${CYAN}">FILE</text>
    <text x="640" y="362" font-family="JetBrains Mono" font-size="19" fill="${INK_DIM}">the norvid-studies /</text>
    <text x="640" y="390" font-family="JetBrains Mono" font-size="19" fill="${INK_DIM}">croissanthology.com beef.</text>
    <text x="640" y="432" font-family="JetBrains Mono" font-weight="700" font-size="19" fill="${ORANGE}">spare no expense.</text>
    <text x="640" y="460" font-family="JetBrains Mono" font-weight="700" font-size="19" fill="${AMBER}">do a breakthrough.</text>
    <text x="640" y="514" font-family="JetBrains Mono" font-size="17" fill="${INK_DIM}">duckfile.bisks.net</text>
  </g>
</svg>`;

const resvg = new Resvg(svg, {
  font: {
    fontFiles: [join(__dirname, "fonts/JetBrainsMono.ttf")],
    loadSystemFonts: false,
    defaultFontFamily: "JetBrains Mono",
  },
  background: BG,
});
const png = resvg.render().asPng();
writeFileSync(join(__dirname, "public/og.png"), png);
console.log(`wrote public/og.png (${png.length} bytes)`);
