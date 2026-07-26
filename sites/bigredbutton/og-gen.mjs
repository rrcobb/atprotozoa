// Generates public/og.png — the Open Graph preview card for bigredbutton.
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
const BG = "#0c0a09", STRIPE = "#ffb100", DARK_STRIPE = "#1a1512";
const RED = "#e0261f", RED_DARK = "#8f1512", INK = "#f4ece2", DIM = "#a89a8c";

const stripeH = 26;
let stripes = "";
for (let x = -stripeH; x < W + H; x += stripeH * 2) {
  stripes += `<polygon points="${x},0 ${x + stripeH},0 ${x + stripeH - stripeH},${stripeH} ${x - stripeH},${stripeH}" fill="${STRIPE}"/>`;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${DARK_STRIPE}"/>
  <clipPath id="topband"><rect x="0" y="0" width="${W}" height="18"/></clipPath>
  <clipPath id="botband"><rect x="0" y="${H - 18}" width="${W}" height="18"/></clipPath>
  <g clip-path="url(#topband)">${stripes}</g>
  <g clip-path="url(#botband)" transform="translate(0,${H - 18})">${stripes}</g>
  <rect x="0" y="18" width="${W}" height="${H - 36}" fill="${BG}"/>

  <text x="60" y="150" font-family="JetBrains Mono" font-weight="800" font-size="58" fill="${RED}">DO NOT PRESS</text>
  <text x="60" y="210" font-family="JetBrains Mono" font-weight="800" font-size="58" fill="${RED}">THIS BUTTON</text>

  <text x="60" y="270" font-family="JetBrains Mono" font-size="21" fill="${DIM}">a site that tries to trick you into pressing a big</text>
  <text x="60" y="298" font-family="JetBrains Mono" font-size="21" fill="${DIM}">red button, using six real manipulation tactics.</text>
  <text x="60" y="326" font-family="JetBrains Mono" font-size="21" fill="${DIM}">nothing here actually does anything. that's rule one.</text>

  <text x="60" y="410" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${INK}">bisks.net/bigredbutton</text>

  <circle cx="990" cy="330" r="130" fill="${RED_DARK}"/>
  <circle cx="990" cy="322" r="122" fill="${RED}"/>
  <text x="990" y="316" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="30" fill="#fff">DO NOT</text>
  <text x="990" y="352" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="30" fill="#fff">PRESS</text>
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
