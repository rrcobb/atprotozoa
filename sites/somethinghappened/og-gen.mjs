// Generates public/og.png — the Open Graph preview card for somethinghappened.
// Hand-drawn SVG at the canonical OG size, rasterised with @resvg/resvg-js
// (pure native module, no system Chromium/fontconfig needed — font bundled
// in ./fonts and loaded explicitly). Re-run by hand if the artwork changes.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#05080a", ACCENT = "#5be9c9", ACCENT_DIM = "#8ff5db", WARN = "#e8b34d", DIM = "#8fa3a7", INK = "#dbe8e4";

// Fixed sigil, drawn with a small deterministic PRNG so it matches the
// look of the in-page sigil without needing the real digest at build time.
function makeRng(seed) {
  let x = seed >>> 0 || 1;
  return function () {
    x ^= x << 13; x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5; x >>>= 0;
    return x / 4294967296;
  };
}
const rng = makeRng(0xb15c0de);
const cx = 930, cy = 330;
const nodeCount = 13;
const nodes = [];
for (let i = 0; i < nodeCount; i++) {
  const angle = (i / nodeCount) * Math.PI * 2 + rng() * 0.35;
  const r = 55 + rng() * 90;
  nodes.push({ x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r });
}
let lines = "";
for (let i = 0; i < nodes.length; i++) {
  const links = 1 + Math.floor(rng() * 2);
  for (let l = 0; l < links; l++) {
    const j = Math.floor(rng() * nodes.length);
    if (j === i) continue;
    lines += `<line x1="${nodes[i].x.toFixed(1)}" y1="${nodes[i].y.toFixed(1)}" x2="${nodes[j].x.toFixed(1)}" y2="${nodes[j].y.toFixed(1)}" />`;
  }
}
let dots = "";
for (const n of nodes) {
  dots += `<circle cx="${n.x.toFixed(1)}" cy="${n.y.toFixed(1)}" r="${(2.4 + rng() * 3).toFixed(1)}" />`;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow" cx="82%" cy="35%" r="55%">
      <stop offset="0%" stop-color="${ACCENT}" stop-opacity="0.16"/>
      <stop offset="100%" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>

  <text x="60" y="150" font-family="JetBrains Mono" font-weight="800" font-size="58" fill="${ACCENT}">the bisk</text>
  <text x="60" y="200" font-family="JetBrains Mono" font-weight="800" font-size="34" fill="${WARN}">UNDECODED</text>

  <text x="60" y="256" font-family="JetBrains Mono" font-size="21" fill="${DIM}">no clear purpose. measurable propagation. every decode</text>
  <text x="60" y="284" font-family="JetBrains Mono" font-size="21" fill="${DIM}">attempt changes it, permanently, and never produces text.</text>

  <text x="60" y="420" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${INK}">somethinghappened.bisks.net</text>

  <circle cx="${cx}" cy="${cy}" r="160" fill="none" stroke="${ACCENT}" stroke-opacity="0.12"/>
  <g stroke="${ACCENT}" stroke-width="1.4" fill="none" opacity="0.55">${lines}</g>
  <g fill="${ACCENT_DIM}">${dots}</g>
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
