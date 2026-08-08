// Generates public/og.png — the Open Graph preview card for infrasound.
//
// Hand-drawn "conspiracy corkboard" SVG at the canonical OG size, rasterised
// with @resvg/resvg-js (pure native module, no system Chromium needed — this
// box has no fontconfig/system fonts either, so the font is bundled in
// ./fonts and loaded explicitly).
// Copied from beefcheck/og-gen.mjs (copy, don't abstract).
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
const BOARD = "#b5905c";
const BOARD_DARK = "#9c7a4b";
const PAPER = "#f1e6cf";
const INK = "#201510";
const RED = "#b6221c";
const RED_BRIGHT = "#e2382c";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// scattered cork-dot texture, seeded RNG so the card is deterministic
let seed = 4177;
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
let dots = "";
for (let i = 0; i < 220; i++) {
  const x = rnd() * W;
  const y = rnd() * H;
  dots += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="1" fill="#000" opacity="0.06"/>`;
}

function node(x, y, w, h, label, sub) {
  return `
  <g>
    <rect x="${x - w / 2}" y="${y - h / 2}" width="${w}" height="${h}" fill="${PAPER}" stroke="rgba(0,0,0,0.25)"/>
    <circle cx="${x}" cy="${y - h / 2 - 2}" r="6" fill="${RED}"/>
    <text x="${x}" y="${y - 2}" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="15" fill="${INK}">${esc(label)}</text>
    ${sub ? `<text x="${x}" y="${y + 16}" text-anchor="middle" font-family="JetBrains Mono" font-size="11" fill="#5a4a3a">${esc(sub)}</text>` : ""}
  </g>`;
}

const nA = { x: 205, y: 150 };
const nB = { x: 470, y: 260 };
const nC = { x: 205, y: 340 };
const nD = { x: 430, y: 100 };

const svg = `
<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${W}" height="${H}" fill="${BOARD}"/>
  <rect width="${W}" height="${H}" fill="${BOARD_DARK}" opacity="0.15"/>
  ${dots}

  <!-- corkboard cluster, left third -->
  <path d="M${nA.x},${nA.y} Q ${(nA.x+nB.x)/2+20},${(nA.y+nB.y)/2} ${nB.x},${nB.y}" fill="none" stroke="${RED}" stroke-width="3" opacity="0.85"/>
  <path d="M${nC.x},${nC.y} Q ${(nC.x+nB.x)/2-10},${(nC.y+nB.y)/2+10} ${nB.x},${nB.y}" fill="none" stroke="${RED}" stroke-width="3" opacity="0.85"/>
  <path d="M${nA.x},${nA.y} Q ${(nA.x+nD.x)/2},${(nA.y+nD.y)/2-20} ${nD.x},${nD.y}" fill="none" stroke="${RED}" stroke-width="3" opacity="0.85"/>
  <path d="M${nD.x},${nD.y} Q ${(nD.x+nB.x)/2+10},${(nD.y+nB.y)/2} ${nB.x},${nB.y}" fill="none" stroke="${RED}" stroke-width="3" opacity="0.85"/>

  ${node(nA.x, nA.y, 170, 62, "demigirlboss", "origin of the post")}
  ${node(nB.x, nB.y, 170, 62, "the algorithm", "shows them to each other")}
  ${node(nC.x, nC.y, 170, 62, "bee population", "declining. coincidence?")}
  ${node(nD.x, nD.y, 170, 62, "Andy Masley", "subject, allegedly")}

  <!-- right side: title block on a torn paper card -->
  <g>
    <rect x="600" y="90" width="560" height="450" fill="${PAPER}" transform="rotate(1.5 880 315)" opacity="0.97"/>
    <text x="640" y="175" font-family="JetBrains Mono" font-weight="700" font-size="19" fill="${RED}" letter-spacing="2" transform="rotate(1.5 880 315)">DECLASSIFIED — PARTIALLY — BY ACCIDENT</text>
    <text x="640" y="240" font-family="JetBrains Mono" font-weight="900" font-size="56" fill="${INK}" transform="rotate(1.5 880 315)">THE INFRASOUND</text>
    <text x="640" y="300" font-family="JetBrains Mono" font-weight="900" font-size="56" fill="${RED_BRIGHT}" transform="rotate(1.5 880 315)">FILE</text>
    <text x="640" y="350" font-family="JetBrains Mono" font-size="19" fill="#3a2a1a" transform="rotate(1.5 880 315)">an evidence board on the</text>
    <text x="640" y="378" font-family="JetBrains Mono" font-size="19" fill="#3a2a1a" transform="rotate(1.5 880 315)">demigirlboss / Andy Masley beef.</text>
    <text x="640" y="424" font-family="JetBrains Mono" font-weight="700" font-size="19" fill="${RED}" transform="rotate(1.5 880 315)">the graphs insinuate.</text>
    <text x="640" y="452" font-family="JetBrains Mono" font-weight="700" font-size="19" fill="${RED}" transform="rotate(1.5 880 315)">the facts are fuzzy.</text>
    <text x="640" y="510" font-family="JetBrains Mono" font-size="17" fill="#5a4a3a" transform="rotate(1.5 880 315)">infrasound.bisks.net</text>
  </g>
</svg>`;

const resvg = new Resvg(svg, {
  font: {
    fontFiles: [join(__dirname, "fonts/JetBrainsMono.ttf")],
    loadSystemFonts: false,
    defaultFontFamily: "JetBrains Mono",
  },
  background: BOARD,
});
const png = resvg.render().asPng();
writeFileSync(join(__dirname, "public/og.png"), png);
console.log(`wrote public/og.png (${png.length} bytes)`);
