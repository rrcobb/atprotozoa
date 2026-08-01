// Generates public/og.png — the Open Graph preview card for torment-nexus.
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
const BG = "#0a0c0d", STRIPE = "#ffb100", DARK_STRIPE = "#14100c";
const GREEN = "#35ff9c", GREEN_DARK = "#0f8f57", RED = "#ff4d4d", INK = "#eaf6f2", DIM = "#7d9691";

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

  <text x="60" y="140" font-family="JetBrains Mono" font-weight="800" font-size="54" fill="${GREEN}">THE TORMENT</text>
  <text x="60" y="200" font-family="JetBrains Mono" font-weight="800" font-size="54" fill="${GREEN}">NEXUS</text>

  <text x="60" y="260" font-family="JetBrains Mono" font-size="20" fill="${DIM}">rewinds any Bluesky feed and shows you the network</text>
  <text x="60" y="288" font-family="JetBrains Mono" font-size="20" fill="${DIM}">the way one specific person saw it. gated behind a</text>
  <text x="60" y="316" font-family="JetBrains Mono" font-size="20" fill="${DIM}">human ethics review board. the board always says no.</text>

  <text x="60" y="400" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${INK}">torment-nexus.bisks.net</text>

  <rect x="880" y="200" width="260" height="230" rx="10" fill="#11171a" stroke="#1f2a2c" stroke-width="2"/>
  <rect x="905" y="230" width="210" height="46" rx="4" fill="none" stroke="${RED}" stroke-width="4" transform="rotate(-4 1010 253)"/>
  <text x="1010" y="260" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="19" fill="${RED}" transform="rotate(-4 1010 253)">DENIED</text>
  <text x="1010" y="330" text-anchor="middle" font-family="JetBrains Mono" font-size="16" fill="${DIM}">request for</text>
  <text x="1010" y="352" text-anchor="middle" font-family="JetBrains Mono" font-size="16" fill="${DIM}">perspective access</text>
  <text x="1010" y="392" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="16" fill="${GREEN_DARK}">board: n/a</text>
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
