// Generates public/og.png — the Open Graph preview card for mootvelocity.
// Hand-drawn SVG at the canonical OG size, rasterised with @resvg/resvg-js
// (pure native module, no system Chromium / fontconfig needed — the font is
// bundled in ./fonts and loaded explicitly). Same recipe as
// sites/peakposting/og-gen.mjs / sites/didscope/og-gen.mjs.
//
//   node og-gen.mjs   # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract. Re-run by hand if the
// artwork changes.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const PAGE = "#f9f9f7", SURFACE = "#fcfcfb", INK = "#0b0b0b", DIM = "#6b6a64";
const GRID = "#e1e0d9", ACCENT = "#2a78d6", CONTEXT = "#b4b2a9", BORDER = "#dcdbd4";

// A small mock scatter — gray "moots" scattered low/left, one blue "you" dot
// riding well above the guide line to sell the pitch at a glance.
const cardX = 528, cardY = 90, cardW = 610, cardH = 450;
const plotL = cardX + 60, plotR = cardX + cardW - 40;
const plotT = cardY + 40, plotB = cardY + cardH - 60;

const contextDots = [
  [0.12, 0.82], [0.22, 0.7], [0.3, 0.88], [0.38, 0.6], [0.48, 0.75],
  [0.55, 0.5], [0.62, 0.68], [0.7, 0.42], [0.8, 0.58], [0.86, 0.3],
];
const youDot = [0.66, 0.14];

const dotsSvg = contextDots
  .map(([fx, fy]) => {
    const cx = plotL + fx * (plotR - plotL);
    const cy = plotT + fy * (plotB - plotT);
    return `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="8" fill="${CONTEXT}" stroke="${SURFACE}" stroke-width="2.5"/>`;
  })
  .join("\n  ");

const youCx = plotL + youDot[0] * (plotR - plotL);
const youCy = plotT + youDot[1] * (plotB - plotT);

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${PAGE}"/>

  <text x="64" y="128" font-family="JetBrains Mono" font-weight="800" font-size="44" fill="${ACCENT}">mootvelocity</text>
  <text x="64" y="168" font-family="JetBrains Mono" font-size="20" fill="${INK}" font-weight="600">follower velocity,</text>
  <text x="64" y="196" font-family="JetBrains Mono" font-size="20" fill="${INK}" font-weight="600">not account age</text>

  <text x="64" y="270" font-family="JetBrains Mono" font-size="17" fill="${DIM}">chart yourself and your</text>
  <text x="64" y="298" font-family="JetBrains Mono" font-size="17" fill="${DIM}">moots on followers vs.</text>
  <text x="64" y="326" font-family="JetBrains Mono" font-size="17" fill="${DIM}"><tspan fill="${INK}" font-weight="700">real</tspan> active time — silent</text>
  <text x="64" y="354" font-family="JetBrains Mono" font-size="17" fill="${DIM}">lurking years get chunked</text>
  <text x="64" y="382" font-family="JetBrains Mono" font-size="17" fill="${DIM}">out, not counted against you.</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${ACCENT}">mootvelocity.bisks.net</text>

  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="16" fill="${SURFACE}" stroke="${BORDER}" stroke-width="1.5"/>
  <line x1="${plotL}" y1="${plotT}" x2="${plotL}" y2="${plotB}" stroke="${GRID}" stroke-width="1.5"/>
  <line x1="${plotL}" y1="${plotB}" x2="${plotR}" y2="${plotB}" stroke="${GRID}" stroke-width="1.5"/>
  <line x1="${plotL}" y1="${plotB}" x2="${plotR}" y2="${plotT + 10}" stroke="${GRID}" stroke-width="1.5" stroke-dasharray="4,5"/>
  ${dotsSvg}
  <circle cx="${youCx.toFixed(1)}" cy="${youCy.toFixed(1)}" r="12" fill="${ACCENT}" stroke="${SURFACE}" stroke-width="3"/>
  <text x="${(youCx + 20).toFixed(1)}" y="${(youCy + 5).toFixed(1)}" font-family="JetBrains Mono" font-weight="700" font-size="17" fill="${ACCENT}">you</text>
  <text x="${cardX + 30}" y="${cardY + cardH - 22}" font-family="JetBrains Mono" font-size="15" fill="${DIM}">active time →</text>
</svg>`;

const fontPath = fileURLToPath(new URL("./fonts/JetBrainsMono.ttf", import.meta.url));
const r = new Resvg(svg, {
  fitTo: { mode: "width", value: W },
  font: { fontFiles: [fontPath], loadSystemFonts: false, defaultFontFamily: "JetBrains Mono" },
});
const png = r.render().asPng();
const out = fileURLToPath(new URL("./public/og.png", import.meta.url));
writeFileSync(out, png);
console.log("wrote", out, png.length, "bytes");
