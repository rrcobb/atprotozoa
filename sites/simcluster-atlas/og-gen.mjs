// Generates public/og.png — the Open Graph preview card for simcluster atlas.
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
const BG_A = "#f6f0e2", BG_B = "#efe6d0", LINE = "#ddceac";
const INK = "#2c2418", DIM = "#7a6f58", TEAL = "#0e6e6e", BRASS = "#a9762f";

function esc(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// A loose scatter of "cluster" nodes with route lines between them, like a
// hand-drawn map of connected settlements — echoes the moots-graph the site
// is actually mapping. Tucked bottom-right so it clears the title/body text.
const nodes = [
  { x: 900, y: 555 }, { x: 970, y: 480 }, { x: 935, y: 400 },
  { x: 1035, y: 410 }, { x: 1075, y: 505 }, { x: 1000, y: 565 },
  { x: 1110, y: 550 }, { x: 1120, y: 430 },
];
const routes = [
  [0, 1], [1, 2], [1, 3], [3, 4], [4, 5], [5, 0], [4, 6], [6, 7], [3, 7],
];
const routeLines = routes
  .map(([a, b]) => {
    const p = nodes[a], q = nodes[b];
    return `<line x1="${p.x}" y1="${p.y}" x2="${q.x}" y2="${q.y}" stroke="${BRASS}" stroke-width="2" stroke-dasharray="1 9" stroke-linecap="round" opacity="0.55"/>`;
  })
  .join("\n  ");
const nodeCircles = nodes
  .map((n, i) => {
    const r = i === 0 ? 9 : 5.5;
    const fill = i === 0 ? TEAL : BRASS;
    return `<circle cx="${n.x}" cy="${n.y}" r="${r}" fill="${fill}" opacity="${i === 0 ? 1 : 0.85}"/>`;
  })
  .join("\n  ");

const cx = 1085, cy = 110, cr = 42;
const compass = `
  <g opacity="0.9">
    <circle cx="${cx}" cy="${cy}" r="${cr}" fill="none" stroke="${DIM}" stroke-width="1.5"/>
    <line x1="${cx}" y1="${cy - cr}" x2="${cx}" y2="${cy + cr}" stroke="${DIM}" stroke-width="1"/>
    <line x1="${cx - cr}" y1="${cy}" x2="${cx + cr}" y2="${cy}" stroke="${DIM}" stroke-width="1"/>
    <polygon points="${cx},${cy - cr + 6} ${cx - 8},${cy} ${cx + 8},${cy}" fill="${BRASS}"/>
    <polygon points="${cx},${cy + cr - 6} ${cx - 8},${cy} ${cx + 8},${cy}" fill="${DIM}"/>
    <text x="${cx}" y="${cy - cr - 10}" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="16" fill="${DIM}">N</text>
  </g>`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${BG_A}"/>
      <stop offset="100%" stop-color="${BG_B}"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect x="40" y="40" width="${W - 80}" height="${H - 80}" fill="none" stroke="${LINE}" stroke-width="2"/>

  ${routeLines}
  ${nodeCircles}
  ${compass}

  <text x="76" y="118" font-family="JetBrains Mono" font-weight="600" font-size="20" letter-spacing="2" fill="${BRASS}">CARTA CLVSTRI — A BISKS.NET MAP</text>
  <text x="76" y="192" font-family="JetBrains Mono" font-weight="700" font-size="56" fill="${INK}">the simcluster atlas</text>
  <text x="76" y="238" font-family="JetBrains Mono" font-style="italic" font-size="25" fill="${TEAL}">${esc("every link your mutuals dropped")}</text>

  <text x="76" y="430" font-family="JetBrains Mono" font-size="23" fill="${INK}">type a handle — map its simcluster, itself plus its mutuals —</text>
  <text x="76" y="464" font-family="JetBrains Mono" font-size="23" fill="${INK}">and see every link the cluster has shared, newest first.</text>

  <text x="76" y="${H - 62}" text-anchor="start" font-family="JetBrains Mono" font-weight="700" font-size="24" fill="${TEAL}">bisks.net/simcluster-atlas</text>
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
