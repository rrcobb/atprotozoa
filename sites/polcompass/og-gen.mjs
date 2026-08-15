// Generates public/og.png — the Open Graph preview card for polcompass. Hand-
// drawn SVG at the canonical OG size, rasterised with @resvg/resvg-js (pure
// native module, no system Chromium/fontconfig needed — font is bundled in
// ./fonts and loaded explicitly). Copied from sites/quadrants/og-gen.mjs.
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
const ACCENT = "#1a5fd0", ACCENT2 = "#d0461a", GOLD = "#c9a227";

const plotX = 700, plotY = 95, plotSize = 440;

// A handful of scattered position dots, plus a couple of "anchor" diamonds,
// to read as a live quadrant chart at a glance.
const dots = [
  { x: 0.62, y: 0.7, c: ACCENT }, { x: -0.3, y: 0.45, c: ACCENT },
  { x: 0.15, y: -0.55, c: ACCENT }, { x: -0.6, y: -0.2, c: ACCENT },
  { x: 0.4, y: 0.1, c: ACCENT2 }, { x: -0.75, y: 0.65, c: GOLD },
];
const anchors = [{ x: -0.15, y: 0.85 }, { x: 0.8, y: -0.4 }];

function toPx(x, y) {
  return [plotX + ((x + 1) / 2) * plotSize, plotY + ((1 - y) / 2) * plotSize];
}

let markers = "";
for (const a of anchors) {
  const [ax, ay] = toPx(a.x, a.y);
  const s = 9;
  markers += `<polygon points="${ax},${ay - s} ${ax + s},${ay} ${ax},${ay + s} ${ax - s},${ay}" fill="${MUTED}" />\n  `;
}
for (const d of dots) {
  const [px, py] = toPx(d.x, d.y);
  markers += `<circle cx="${px}" cy="${py}" r="12" fill="${d.c}" stroke="${BG}" stroke-width="3" />\n  `;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${BG}"/>

  <text x="64" y="140" font-family="JetBrains Mono" font-weight="800" font-size="66" fill="${INK}">polcompass</text>
  <text x="64" y="188" font-family="JetBrains Mono" font-size="22" fill="${MUTED}">make a <tspan fill="${ACCENT}">political compass</tspan></text>

  <text x="64" y="270" font-family="JetBrains Mono" font-size="17" fill="${MUTED}">lay out any 2x2 chart, no login needed.</text>
  <text x="64" y="296" font-family="JetBrains Mono" font-size="17" fill="${MUTED}">the whole thing lives in its own link,</text>
  <text x="64" y="322" font-family="JetBrains Mono" font-size="17" fill="${MUTED}">so it actually works for whoever</text>
  <text x="64" y="348" font-family="JetBrains Mono" font-size="17" fill="${MUTED}">you send it to.</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${ACCENT}">polcompass.bisks.net</text>

  <rect x="${plotX}" y="${plotY}" width="${plotSize}" height="${plotSize}" fill="none" stroke="${INK}" stroke-width="3" rx="10"/>
  <line x1="${plotX + plotSize / 2}" y1="${plotY}" x2="${plotX + plotSize / 2}" y2="${plotY + plotSize}" stroke="${FAINT}" stroke-width="3"/>
  <line x1="${plotX}" y1="${plotY + plotSize / 2}" x2="${plotX + plotSize}" y2="${plotY + plotSize / 2}" stroke="${FAINT}" stroke-width="3"/>
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
