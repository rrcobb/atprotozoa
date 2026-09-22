// Generates public/og.png — the Open Graph preview card for pixelcreep.
//
// Hand-drawn SVG at the canonical OG size, rasterised with @resvg/resvg-js
// (pure native module, no system Chromium/fontconfig needed — the font is
// bundled in ./fonts and loaded explicitly). node_modules + fonts copied in
// from sites/brewpaint, which already vendors this. House style:
// self-contained, copy-don't-abstract.
//
//   node og-gen.mjs   # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#16171a", PANEL = "#202226", BORDER = "#3a3d44";
const FG = "#eceef0", DIM = "#9a9ea6", ACCENT = "#7ad3ff", ACCENT2 = "#ffb454";

// three snapshot pfps at increasing reveal — a stand-in avatar (a plain
// gradient head silhouette) with a growing circle of the "new" solid color
const boxX = 700, boxY = 90, gap = 34, size = 150;
const stages = [0.06, 0.5, 1]; // radius fraction of size, roughly matching sqrt(t) at t=0.004/0.25/1

let stageSvg = "";
stages.forEach((frac, i) => {
  const cx = boxX + i * (size + gap) + size / 2;
  const cy = boxY + size / 2;
  const r = (size / 2) * frac;
  const clipId = `clip${i}`;
  stageSvg += `
    <clipPath id="${clipId}"><circle cx="${cx}" cy="${cy}" r="${Math.max(r, 1.5)}"/></clipPath>
    <circle cx="${cx}" cy="${cy}" r="${size / 2}" fill="#40444c"/>
    <circle cx="${cx}" cy="${cy - size * 0.08}" r="${size * 0.19}" fill="#5b6067"/>
    <ellipse cx="${cx}" cy="${cy + size * 0.36}" rx="${size * 0.32}" ry="${size * 0.22}" fill="#5b6067"/>
    <circle cx="${cx}" cy="${cy}" r="${size / 2}" fill="${ACCENT}" clip-path="url(#${clipId})"/>
    <circle cx="${cx}" cy="${cy}" r="${size / 2}" fill="none" stroke="${BORDER}" stroke-width="2"/>
    <text x="${cx}" y="${cy + size / 2 + 26}" font-family="JetBrains Mono" font-size="16" fill="${DIM}" text-anchor="middle">${Math.round(frac * frac * 100)}%</text>
  `;
});

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${BG}"/>

  <text x="64" y="150" font-family="JetBrains Mono" font-weight="800" font-size="58" fill="${ACCENT2}">pixel<tspan fill="${ACCENT}">creep</tspan></text>
  <text x="64" y="196" font-family="JetBrains Mono" font-size="21" fill="${DIM}">the pfp that grows from one pixel</text>

  <text x="64" y="270" font-family="JetBrains Mono" font-size="18" fill="${DIM}">Upload your current pfp and a new one, pick the</text>
  <text x="64" y="298" font-family="JetBrains Mono" font-size="18" fill="${DIM}">pixel it grows from, then drag a slider from a</text>
  <text x="64" y="326" font-family="JetBrains Mono" font-size="18" fill="${DIM}">single pixel to the whole frame. Nobody notices.</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${ACCENT}">pixelcreep.bisks.net</text>

  ${stageSvg}
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
