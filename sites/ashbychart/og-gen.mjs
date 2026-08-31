// Generates public/og.png — the Open Graph preview card for ashbychart. Hand-
// drawn SVG at the canonical OG size, rasterised with @resvg/resvg-js (pure
// native module, no system Chromium/fontconfig needed — font is bundled in
// ./fonts and loaded explicitly). Copied from sites/polcompass/og-gen.mjs.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// you change the artwork.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#fffdf8", INK = "#14171a", MUTED = "#6b6b6b", FAINT = "#e2ddd0";
const ACCENT = "#1a5fd0", ACCENT2 = "#d0461a";

const plotX = 680, plotY = 95, plotW = 460, plotH = 440;

// A scattered handful of "accounts" (dots), with the top-right frontier
// (non-dominated points) connected by the dashed Ashby "selection line".
const dots = [
  { x: 0.08, y: 0.15 }, { x: 0.22, y: 0.55 }, { x: 0.35, y: 0.3 },
  { x: 0.5, y: 0.78 }, { x: 0.6, y: 0.42 }, { x: 0.72, y: 0.6 },
  { x: 0.8, y: 0.92 }, { x: 0.92, y: 0.7 },
];
const frontier = [{ x: 0.08, y: 0.15 }, { x: 0.5, y: 0.78 }, { x: 0.8, y: 0.92 }, { x: 0.92, y: 0.7 }];

function toPx(x, y) {
  return [plotX + x * plotW, plotY + (1 - y) * plotH];
}

let markers = "";
for (const d of dots) {
  const [px, py] = toPx(d.x, d.y);
  markers += `<circle cx="${px}" cy="${py}" r="11" fill="${ACCENT}" stroke="${BG}" stroke-width="3" />\n  `;
}
const frontierPts = frontier.map((p) => toPx(p.x, p.y).join(",")).join(" ");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${BG}"/>

  <text x="64" y="140" font-family="JetBrains Mono" font-weight="800" font-size="60" fill="${INK}">ashbychart</text>
  <text x="64" y="186" font-family="JetBrains Mono" font-size="22" fill="${MUTED}">an <tspan fill="${ACCENT}">Ashby materials-selection chart</tspan></text>
  <text x="64" y="216" font-family="JetBrains Mono" font-size="22" fill="${MUTED}">for Bluesky accounts</text>

  <text x="64" y="284" font-family="JetBrains Mono" font-size="17" fill="${MUTED}">pick two public account stats, drop in</text>
  <text x="64" y="310" font-family="JetBrains Mono" font-size="17" fill="${MUTED}">some handles, see who's out on the</text>
  <text x="64" y="336" font-family="JetBrains Mono" font-size="17" fill="${ACCENT2}">trade-off frontier.</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${ACCENT}">ashbychart.bisks.net</text>

  <rect x="${plotX}" y="${plotY}" width="${plotW}" height="${plotH}" fill="none" stroke="${INK}" stroke-width="3" rx="10"/>
  <polyline points="${frontierPts}" fill="none" stroke="${ACCENT2}" stroke-width="4" stroke-dasharray="10 8"/>
  ${markers}
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
