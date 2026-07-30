// Generates public/og.png — the Open Graph preview card for SLOP WATER, so a
// shared link auto-renders a picture of the bottle instead of a bare URL.
// Hand-drawn SVG at the canonical OG size, rasterised with @resvg/resvg-js
// (pure native module, no system Chromium/fontconfig needed — font is
// bundled in ./fonts and loaded explicitly). Mirrors sites/didscope's recipe.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// A generic sample result (not tied to any real playthrough) — the static
// fallback card for the bare link. Per-game share cards are generated live,
// client-side, in public/index.html (buildShareCard).

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#eef7fb", FG = "#0e2a33", DIM = "#4f7480";
const ACCENT = "#1a8fb0", ACCENT2 = "#4caf6f", CARD = "#ffffff", BORDER = "#c3dee6";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const cardX = 780, cardY = 70, cardW = 360, cardH = 490;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="85%" cy="10%" r="60%">
      <stop offset="0" stop-color="#d7f2e2"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>

  <text x="60" y="110" font-family="JetBrains Mono" font-weight="800" font-size="56" fill="${ACCENT}">SLOP WATER&#8482;</text>
  <text x="60" y="148" font-family="JetBrains Mono" font-size="20" fill="${DIM}">the purest tasting slop on earth&#174;</text>

  <text x="60" y="230" font-family="JetBrains Mono" font-size="19" fill="${FG}">Dunk the powder in. Shake for your life.</text>
  <text x="60" y="266" font-family="JetBrains Mono" font-size="19" fill="${FG}">Get a custom flavor, a purity score,</text>
  <text x="60" y="302" font-family="JetBrains Mono" font-size="19" fill="${FG}">and a bottle wrapper worth reviewing.</text>

  <text x="60" y="580" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${ACCENT2}">bisks.net/games/slopwater</text>

  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="18" fill="${CARD}" stroke="${BORDER}" stroke-width="2"/>

  <rect x="${cardX + 24}" y="${cardY + 24}" width="${cardW - 48}" height="160" rx="12" fill="hsl(96, 45%, 34%)"/>
  <text x="${cardX + cardW / 2}" y="${cardY + 110}" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="20" fill="#ffffff">DISCERNING-TIER SLUDGE</text>

  <text x="${cardX + cardW / 2}" y="${cardY + 224}" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="24" fill="${FG}">Glacial Slurry</text>
  <text x="${cardX + cardW / 2}" y="${cardY + 258}" text-anchor="middle" font-family="JetBrains Mono" font-size="15" fill="${DIM}">your custom flavor</text>

  <text x="${cardX + 84}" y="${cardY + 320}" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="30" fill="${ACCENT}">71%</text>
  <text x="${cardX + 84}" y="${cardY + 342}" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="12" fill="${DIM}">purity</text>
  <text x="${cardX + 180}" y="${cardY + 320}" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="30" fill="${ACCENT}">38</text>
  <text x="${cardX + 180}" y="${cardY + 342}" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="12" fill="${DIM}">shakes</text>
  <text x="${cardX + 276}" y="${cardY + 320}" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="30" fill="${ACCENT}">64%</text>
  <text x="${cardX + 276}" y="${cardY + 342}" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="12" fill="${DIM}">rhythm</text>

  <text x="${cardX + cardW / 2}" y="${cardY + cardH - 30}" text-anchor="middle" font-family="JetBrains Mono" font-size="13" fill="${DIM}">${esc("now fortified with mystery powder,")}</text>
  <text x="${cardX + cardW / 2}" y="${cardY + cardH - 12}" text-anchor="middle" font-family="JetBrains Mono" font-size="13" fill="${DIM}">${esc("imported only for the discerning.")}</text>
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
