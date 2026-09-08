// Generates public/og.png — the Open Graph preview card for hyperqualia.
// Hand-drawn SVG at the canonical OG size, rasterised with @resvg/resvg-js
// (pure native module, no system Chromium/fontconfig needed — font is
// bundled in ./fonts and loaded explicitly). Copied from sites/nextbigthing/og-gen.mjs.
//
//   node og-gen.mjs   # writes ./public/og.png (node_modules/@resvg copied in already)

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG1 = "#08040f", BG2 = "#1a0d30";
const FG = "#f1eaff", DIM = "#9a8ab8";
const ACCENT = "#ff5fd1", ACCENT2 = "#58e6d9", ACCENT3 = "#ffcf5c";

// A classic 2D tesseract projection: two nested squares with corners joined —
// the same wireframe icon the live page rotates, held still for the card.
function tesseractWireframe(cx, cy, rOuter, rInner) {
  const outer = [
    [cx - rOuter, cy - rOuter], [cx + rOuter, cy - rOuter],
    [cx + rOuter, cy + rOuter], [cx - rOuter, cy + rOuter],
  ];
  const inner = [
    [cx - rInner, cy - rInner], [cx + rInner, cy - rInner],
    [cx + rInner, cy + rInner], [cx - rInner, cy + rInner],
  ];
  const sq = (pts) => `M ${pts[0][0]} ${pts[0][1]} L ${pts[1][0]} ${pts[1][1]} L ${pts[2][0]} ${pts[2][1]} L ${pts[3][0]} ${pts[3][1]} Z`;
  const joins = outer.map((p, i) => `M ${p[0]} ${p[1]} L ${inner[i][0]} ${inner[i][1]}`).join(" ");
  return `${sq(outer)} ${sq(inner)} ${joins}`;
}

const wire = tesseractWireframe(940, 330, 190, 100);

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${BG1}"/>
      <stop offset="1" stop-color="${BG2}"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="${ACCENT}" stop-opacity="0.35"/>
      <stop offset="1" stop-color="${ACCENT}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <circle cx="940" cy="330" r="260" fill="url(#glow)"/>
  <path d="${wire}" fill="none" stroke="${ACCENT2}" stroke-width="2.5" stroke-opacity="0.85"/>
  <circle cx="940" cy="330" r="6" fill="${ACCENT3}"/>
  <circle cx="1130" cy="140" r="5" fill="${ACCENT3}"/>
  <circle cx="750" cy="520" r="5" fill="${ACCENT3}"/>

  <text x="60" y="150" font-family="JetBrains Mono" font-weight="800" font-size="76" fill="${ACCENT}">hyperqualia</text>
  <text x="60" y="200" font-family="JetBrains Mono" font-size="24" fill="${FG}">a real hyperplane slice through a rotating tesseract</text>

  <text x="60" y="280" font-family="JetBrains Mono" font-size="20" fill="${DIM}">the mind's output is higher dimensional — narrative is just</text>
  <text x="60" y="310" font-family="JetBrains Mono" font-size="20" fill="${DIM}">the accessible slice of it. breathwork, ayahuasca, prayer,</text>
  <text x="60" y="340" font-family="JetBrains Mono" font-size="20" fill="${DIM}">and DMT only surface when the plane actually reaches them.</text>

  <rect x="60" y="400" width="640" height="4" fill="${ACCENT2}" opacity="0.6"/>
  <text x="60" y="460" font-family="JetBrains Mono" font-weight="700" font-size="26" fill="${ACCENT2}">live d3 · computed off the tesseract's actual rotated edges</text>

  <text x="60" y="570" font-family="JetBrains Mono" font-weight="700" font-size="30" fill="${ACCENT3}">hyperqualia.bisks.net</text>
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
