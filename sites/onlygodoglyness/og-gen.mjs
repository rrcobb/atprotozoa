// Generates public/og.png — the Open Graph preview card for Only. Hand-drawn
// SVG at the canonical OG size, rasterised with @resvg/resvg-js (no system
// fonts on this box — the font is bundled in ./fonts and loaded explicitly).
//
//   node og-gen.mjs   # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract. See sites/wikifix/og-gen.mjs
// and sites/godoglyness/og-gen.mjs for the reference this was copied from.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#060607", CARD = "#0d0e10", LINE = "#212226";
const FG = "#eef0f2", DIM = "#8b8f96", ACCENT = "#7c5cff";

const cardX = 60, cardY = 190, cardW = W - 120, cardH = H - 260;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow" cx="14%" cy="-8%" r="60%">
      <stop offset="0" stop-color="#241a4a"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>

  <text x="60" y="100" font-family="JetBrains Mono" font-weight="800" font-size="52" fill="${FG}">Only</text>
  <text x="60" y="140" font-family="JetBrains Mono" font-size="19" fill="${DIM}">a social network with exactly one (1) poster</text>

  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="18" fill="${CARD}" stroke="${LINE}" stroke-width="1.5"/>

  <circle cx="${cardX + 56}" cy="${cardY + 56}" r="26" fill="${ACCENT}" opacity="0.35"/>
  <text x="${cardX + 96}" y="${cardY + 50}" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${FG}">godoglyness</text>
  <text x="${cardX + 96}" y="${cardY + 74}" font-family="JetBrains Mono" font-size="15" fill="${DIM}">@godoglyness.bsky.social · the whole userbase</text>

  <text x="${cardX + 40}" y="${cardY + 140}" font-family="Georgia, serif" font-size="30" fill="${FG}">the only account.</text>
  <text x="${cardX + 40}" y="${cardY + 182}" font-family="Georgia, serif" font-size="30" fill="${FG}">the only feed. the only</text>
  <text x="${cardX + 40}" y="${cardY + 224}" font-family="Georgia, serif" font-size="30" fill="${FG}">notification you'll never get.</text>

  <text x="${cardX + 40}" y="${cardY + cardH - 34}" font-family="JetBrains Mono" font-size="16" fill="${DIM}">timeline · trends · notifications · DMs — population: 1</text>

  <text x="60" y="${H - 40}" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${ACCENT}">onlygodoglyness.bisks.net</text>
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
