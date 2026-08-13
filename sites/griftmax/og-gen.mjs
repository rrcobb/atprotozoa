// Generates public/og.png — the Open Graph preview card for griftmax.
// Hand-drawn SVG at the canonical OG size, rasterised with @resvg/resvg-js
// (pure native module, no system Chromium / fontconfig needed — the font is
// bundled in ./fonts and loaded explicitly). Same recipe as
// sites/hyperobject/og-gen.mjs / sites/didscope/og-gen.mjs.
//
//   node og-gen.mjs   # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract. Re-run by hand if the
// artwork changes.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#08040f";
const FG = "#f5f0ff", DIM = "#b3a4d6";
const GOLD = "#ffd76a", GOLD2 = "#fff3d1";
const HOT = "#ff2fb0", HOT2 = "#7c3fff";
const CARD = "#170f27", BORDER = "#3a2a55";
const GREEN = "#38ffb0";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const cardX = 620, cardY = 70, cardW = 520, cardH = 490;

// No emoji glyphs — resvg renders with only the bundled JetBrains Mono
// (loadSystemFonts: false, no emoji font available), so an emoji prefix here
// rasterises as a tofu box instead of the character.
const signals = [
  "> live AppView fetch",
  "> firehose / Jetstream",
  "> full repo CAR export",
  "> real atproto OAuth",
  "> browser-owned ascensions",
  "> live AppView profiles",
];
const signalRows = signals
  .map(
    (s, i) =>
      `<text x="${cardX + 34}" y="${cardY + 100 + i * 58}" font-family="JetBrains Mono" font-size="20" fill="${GOLD2}">${esc(s)}</text>`
  )
  .join("\n  ");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="10%" cy="0%" r="55%">
      <stop offset="0" stop-color="#2a1740"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="95%" cy="10%" r="55%">
      <stop offset="0" stop-color="#3a0e2c"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${GOLD}"/>
      <stop offset="0.5" stop-color="${HOT}"/>
      <stop offset="1" stop-color="${HOT2}"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>
  <rect width="${W}" height="${H}" fill="url(#glow2)"/>

  <text x="64" y="150" font-family="JetBrains Mono" font-weight="800" font-size="80" fill="url(#title)">\$GRIFT</text>
  <text x="64" y="196" font-family="JetBrains Mono" font-size="22" fill="${DIM}">the worst possible website.</text>
  <text x="64" y="228" font-family="JetBrains Mono" font-size="22" fill="${DIM}">be excellent about it.</text>

  <text x="64" y="300" font-family="JetBrains Mono" font-size="16" fill="${GREEN}">audited by griftindex — attempting a real 6/6</text>
  <text x="64" y="330" font-family="JetBrains Mono" font-size="16" fill="${DIM}">no fake signals. every meter is live.</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${GOLD}">griftmax.bisks.net</text>

  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="18" fill="${CARD}" stroke="${BORDER}" stroke-width="1.5"/>
  <text x="${cardX + 34}" y="${cardY + 54}" font-family="JetBrains Mono" font-weight="700" font-size="18" letter-spacing="2" fill="${DIM}">SIX REAL THINGS</text>
  ${signalRows}
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
