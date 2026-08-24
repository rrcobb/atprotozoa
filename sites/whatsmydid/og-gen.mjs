// Generates public/og.png — the Open Graph preview card for whatsmydid.
// Hand-drawn SVG at the canonical OG size, rasterised with @resvg/resvg-js.
// Same recipe as sites/byline/og-gen.mjs.
//
//   node og-gen.mjs   # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#0a0d12";
const FG = "#eef1f6", DIM = "#8b93a3";
const ACCENT = "#6ee7b7", ACCENT2 = "#7cb3ff";
const CARD = "#12161d", BORDER = "#232a35";

const cardX = 64, cardY = 330, cardW = W - 128, cardH = 210;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow" cx="90%" cy="0%" r="60%">
      <stop offset="0" stop-color="#123024"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${ACCENT}"/>
      <stop offset="1" stop-color="${ACCENT2}"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>

  <text x="64" y="130" font-family="JetBrains Mono" font-weight="800" font-size="72" fill="url(#title)">whatsmydid</text>
  <text x="64" y="172" font-family="JetBrains Mono" font-size="24" fill="${DIM}">what's your DID again?</text>

  <text x="64" y="240" font-family="JetBrains Mono" font-size="19" fill="${FG}">type a handle, get the did:plc (or did:web) underneath it.</text>
  <text x="64" y="268" font-family="JetBrains Mono" font-size="19" fill="${DIM}">remembers the last one you looked up, for next time.</text>

  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="16" fill="${CARD}" stroke="${BORDER}"/>
  <text x="${cardX + 32}" y="${cardY + 46}" font-family="JetBrains Mono" font-size="14" letter-spacing="2" fill="${ACCENT}">YOUR DID</text>
  <text x="${cardX + 32}" y="${cardY + 92}" font-family="JetBrains Mono" font-weight="700" font-size="30" fill="${FG}">did:plc:xxxxxxxxxxxxxxxxxxxxxxxx</text>
  <text x="${cardX + 32}" y="${cardY + 132}" font-family="JetBrains Mono" font-size="16" fill="${DIM}">the permanent, portable ID behind the handle.</text>
  <text x="${cardX + 32}" y="${cardY + 158}" font-family="JetBrains Mono" font-size="16" fill="${DIM}">the handle can change. this can't.</text>

  <text x="64" y="612" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${ACCENT}">whatsmydid.bisks.net</text>
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
