// Generates public/og.png — the Open Graph preview card for paperclip-factory.
// Hand-drawn SVG at the canonical OG size, rasterised with @resvg/resvg-js
// (pure native module, no system Chromium/fontconfig needed — font bundled
// in ./fonts and loaded explicitly). Re-run by hand if the artwork changes.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// No emoji glyphs here — the bundled mono font has no color-emoji table and
// resvg would render tofu boxes. Paperclips and the odd-one-out star are
// hand-drawn shapes instead (a bent-wire stroke path, feather-icon style).

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#101316", DARK_STRIPE = "#1a1d20", STRIPE = "#ffb100";
const INK = "#eef1f4", DIM = "#8b96a3", ALARM = "#ff6b57", LEGEND = "#c58bff";

const stripeH = 26;
let stripes = "";
for (let x = -stripeH; x < W + H; x += stripeH * 2) {
  stripes += `<polygon points="${x},0 ${x + stripeH},0 ${x + stripeH - stripeH},${stripeH} ${x - stripeH},${stripeH}" fill="${STRIPE}"/>`;
}

// feather-icon "paperclip" path, natively 24x24
const CLIP_PATH =
  "M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48";

function clip(x, y, scale, color) {
  return `<g transform="translate(${x},${y}) scale(${scale})">
    <path d="${CLIP_PATH}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </g>`;
}

function star(x, y, r, color) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : r * 0.42;
    const ang = (Math.PI / 5) * i - Math.PI / 2;
    pts.push(`${x + Math.cos(ang) * rad},${y + Math.sin(ang) * rad}`);
  }
  return `<polygon points="${pts.join(" ")}" fill="${color}"/>`;
}

// row of small paperclips off to the right, one swapped for a star (the
// "occasional anomaly") — mirrors the belt on the actual page
let row = "";
const rowY = 470;
for (let i = 0; i < 8; i++) {
  const x = 690 + i * 58;
  if (i === 5) row += star(x + 10, rowY + 8, 16, LEGEND);
  else row += clip(x, rowY, 1.4, i > 5 ? DIM : INK);
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${DARK_STRIPE}"/>
  <clipPath id="topband"><rect x="0" y="0" width="${W}" height="18"/></clipPath>
  <clipPath id="botband"><rect x="0" y="${H - 18}" width="${W}" height="18"/></clipPath>
  <g clip-path="url(#topband)">${stripes}</g>
  <g clip-path="url(#botband)" transform="translate(0,${H - 18})">${stripes}</g>
  <rect x="0" y="18" width="${W}" height="${H - 36}" fill="${BG}"/>

  ${clip(60, 96, 3.6, INK)}

  <text x="220" y="150" font-family="JetBrains Mono" font-weight="800" font-size="54" fill="${INK}">THE PAPERCLIP</text>
  <text x="220" y="210" font-family="JetBrains Mono" font-weight="800" font-size="54" fill="${INK}">FACTORY</text>

  <text x="60" y="280" font-family="JetBrains Mono" font-size="22" fill="${DIM}">it produces paperclips. mostly. every so often</text>
  <text x="60" y="310" font-family="JetBrains Mono" font-size="22" fill="${DIM}">something else comes off the line instead —</text>
  <text x="60" y="340" font-family="JetBrains Mono" font-size="22" fill="${ALARM}">with a reaction to match.</text>

  <text x="60" y="410" font-family="JetBrains Mono" font-weight="700" font-size="24" fill="${INK}">bisks.net/paperclip-factory</text>

  <rect x="0" y="440" width="${W}" height="80" fill="#0c0e10"/>
  ${row}
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
